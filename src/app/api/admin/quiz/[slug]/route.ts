import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  ensureSeeded,
  isAuthorizedInstructor,
  syncExpiredParticipants,
  buildLeaderboard,
  computeScore,
} from "@/lib/quiz-service";

export const dynamic = "force-dynamic";

function getAdminPin(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim()
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeeded();
    const { slug } = await context.params;

    const quizRows = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.slug, slug))
      .limit(1);

    if (quizRows.length === 0) {
      return NextResponse.json({ error: "الاختبار غير موجود." }, { status: 404 });
    }

    const quiz = quizRows[0];
    const pin = getAdminPin(req);
    if (!(await isAuthorizedInstructor(pin, quiz))) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
    }

    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));

    await syncExpiredParticipants(quiz, qList);

    const pList = await db
      .select()
      .from(participants)
      .where(eq(participants.quizId, quiz.id))
      .orderBy(asc(participants.startedAt));

    const now = new Date();
    const participantsDetailed = pList.map((p) => {
      const remainingSeconds =
        p.status === "in_progress"
          ? Math.max(
              0,
              Math.floor(
                (new Date(p.expiresAt).getTime() - now.getTime()) / 1000
              )
            )
          : 0;

      return {
        id: p.id,
        studentName: p.studentName,
        accessCode: p.accessCode,
        status: p.status,
        score: p.score,
        totalQuestions: qList.length,
        answeredCount: Object.keys(p.answers ?? {}).length,
        startedAt: new Date(p.startedAt).toISOString(),
        expiresAt: new Date(p.expiresAt).toISOString(),
        submittedAt: p.submittedAt ? new Date(p.submittedAt).toISOString() : null,
        timeTakenSeconds: p.timeTakenSeconds,
        remainingSeconds,
      };
    });

    const leaderboardPreview = buildLeaderboard(pList, qList.length);

    return NextResponse.json({
      quiz,
      questions: qList,
      participants: participantsDetailed,
      leaderboardPreview,
    });
  } catch (error) {
    console.error("GET /api/admin/quiz/[slug] error:", error);
    return NextResponse.json(
      { error: "تعذر تحميل بيانات لوحة التحكم." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeeded();
    const { slug } = await context.params;
    const body = await req.json();

    const quizRows = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.slug, slug))
      .limit(1);

    if (quizRows.length === 0) {
      return NextResponse.json({ error: "الاختبار غير موجود." }, { status: 404 });
    }
    const quiz = quizRows[0];

    const pin = getAdminPin(req);
    if (!(await isAuthorizedInstructor(pin, quiz))) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
    }

    // Optional: Force-finalize any active students right before publishing leaderboard
    if (body.forceFinalizeActive === true) {
      const qList = await db
        .select()
        .from(questions)
        .where(eq(questions.quizId, quiz.id))
        .orderBy(asc(questions.orderIndex));

      const activeParticipants = await db
        .select()
        .from(participants)
        .where(eq(participants.quizId, quiz.id));

      const now = new Date();
      for (const p of activeParticipants) {
        if (p.status === "in_progress") {
          const elapsed = Math.min(
            quiz.durationMinutes * 60,
            Math.max(
              1,
              Math.round(
                (now.getTime() - new Date(p.startedAt).getTime()) / 1000
              )
            )
          );
          const score = computeScore(p.answers ?? {}, qList);
          await db
            .update(participants)
            .set({
              status: "submitted",
              score,
              totalQuestions: qList.length,
              submittedAt: now,
              timeTakenSeconds: elapsed,
            })
            .where(eq(participants.id, p.id));
        }
      }
    }

    const updates: Partial<typeof quizzes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }
    if (typeof body.durationMinutes === "number" && body.durationMinutes >= 1) {
      updates.durationMinutes = Math.min(180, Math.round(body.durationMinutes));
    }
    if (typeof body.maxParticipants === "number" && body.maxParticipants >= 1) {
      updates.maxParticipants = Math.min(200, Math.round(body.maxParticipants));
    }
    if (typeof body.isActive === "boolean") {
      updates.isActive = body.isActive;
    }
    if (typeof body.resultsPublished === "boolean") {
      updates.resultsPublished = body.resultsPublished;
    }
    if (
      typeof body.instructorPin === "string" &&
      body.instructorPin.trim().length >= 3
    ) {
      updates.instructorPin = body.instructorPin.trim();
    }

    await db.update(quizzes).set(updates).where(eq(quizzes.id, quiz.id));

    const updatedRows = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quiz.id))
      .limit(1);

    const res = NextResponse.json({
      ok: true,
      quiz: updatedRows[0],
    });

    if (updates.instructorPin) {
      res.cookies.set("quiz_admin_pin", updates.instructorPin, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });
    }

    return res;
  } catch (error) {
    console.error("PATCH /api/admin/quiz/[slug] error:", error);
    return NextResponse.json(
      { error: "تعذر حفظ إعدادات الاختبار." },
      { status: 500 }
    );
  }
}
