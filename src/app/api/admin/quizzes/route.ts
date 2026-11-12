import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  ensureSeeded,
  generateId,
  isAuthorizedInstructor,
  toAdminQuiz,
} from "@/lib/quiz-service";
import { DEFAULT_QUESTIONS } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

function getAdminPin(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim()
  );
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const pin = getAdminPin(req);
    if (!(await isAuthorizedInstructor(pin))) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
    }

    const allQuizzes = await db
      .select()
      .from(quizzes)
      .orderBy(desc(quizzes.createdAt));

    const enriched = await Promise.all(
      allQuizzes.map(async (quiz) => {
        const qRows = await db
          .select()
          .from(questions)
          .where(eq(questions.quizId, quiz.id));
        const pRows = await db
          .select()
          .from(participants)
          .where(eq(participants.quizId, quiz.id));
        return {
          ...toAdminQuiz(quiz),
          questionsCount: qRows.length,
          participantsCount: pRows.length,
        };
      })
    );

    return NextResponse.json({ quizzes: enriched });
  } catch (error) {
    console.error("GET /api/admin/quizzes error:", error);
    return NextResponse.json(
      { error: "تعذر جلب قائمة الكويزات." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const pin = getAdminPin(req);
    if (!(await isAuthorizedInstructor(pin))) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
    }

    const body = await req.json();
    const title =
      typeof body.title === "string" && body.title.trim().length >= 3
        ? body.title.trim()
        : "اختبار جديد — الدفعة التالية";

    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : "اختبار تنافسي مكوّن من 10 أسئلة اختيار من متعدد مدته 10 دقائق.";

    const durationMinutes =
      typeof body.durationMinutes === "number" && body.durationMinutes >= 1
        ? Math.min(180, Math.round(body.durationMinutes))
        : 10;

    const maxParticipants =
      typeof body.maxParticipants === "number" && body.maxParticipants >= 1
        ? Math.min(200, Math.round(body.maxParticipants))
        : 5;

    const copyDefaultQuestions = body.copyDefaultQuestions !== false;

    const newQuizId = generateId("quiz");
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const slug = `quiz-${randomSuffix}`;

    await db.insert(quizzes).values({
      id: newQuizId,
      slug,
      title,
      description,
      durationMinutes,
      maxParticipants,
      isActive: true,
      resultsPublished: false,
      instructorPin: pin || "2026",
    });

    if (copyDefaultQuestions) {
      for (const q of DEFAULT_QUESTIONS) {
        await db.insert(questions).values({
          id: generateId("q"),
          quizId: newQuizId,
          orderIndex: q.orderIndex,
          questionText: q.questionText,
          options: [...q.options],
          correctOptionIndex: q.correctOptionIndex,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      slug,
      quizId: newQuizId,
    });
  } catch (error) {
    console.error("POST /api/admin/quizzes error:", error);
    return NextResponse.json(
      { error: "تعذر إنشاء اختبار جديد." },
      { status: 500 }
    );
  }
}
