import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions } from "@/db/schema";
import { eq, notInArray, and } from "drizzle-orm";
import {
  ensureSeeded,
  generateId,
  isAuthorizedInstructor,
  recalculateQuizScores,
  stripLeadingArabicOptionPrefix,
} from "@/lib/quiz-service";

export const dynamic = "force-dynamic";

function getAdminPin(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim()
  );
}

interface IncomingQuestion {
  id?: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

export async function PUT(
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

    const body = await req.json();
    const incoming: IncomingQuestion[] = Array.isArray(body.questions)
      ? body.questions
      : [];

    if (incoming.length === 0) {
      return NextResponse.json(
        { error: "يجب أن يحتوي الاختبار على سؤال واحد على الأقل." },
        { status: 400 }
      );
    }

    const existingQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id));
    const existingIds = new Set(existingQuestions.map((q) => q.id));

    const keptIds: string[] = [];

    for (let idx = 0; idx < incoming.length; idx++) {
      const item = incoming[idx];
      const cleanStem = (item.questionText || "").trim();
      if (!cleanStem) {
        return NextResponse.json(
          { error: `يرجى كتابة نص السؤال رقم ${idx + 1}.` },
          { status: 400 }
        );
      }

      if (!Array.isArray(item.options) || item.options.length !== 4) {
        return NextResponse.json(
          { error: `يجب توفير 4 خيارات للسؤال رقم ${idx + 1}.` },
          { status: 400 }
        );
      }

      const cleanedOptions = item.options.map((opt) =>
        stripLeadingArabicOptionPrefix(String(opt ?? ""))
      );

      if (cleanedOptions.some((o) => !o)) {
        return NextResponse.json(
          { error: `جميع الخيارات الأربعة مطلوبة في السؤال رقم ${idx + 1}.` },
          { status: 400 }
        );
      }

      const correctIdx =
        typeof item.correctOptionIndex === "number" &&
        item.correctOptionIndex >= 0 &&
        item.correctOptionIndex <= 3
          ? item.correctOptionIndex
          : 0;

      if (item.id && existingIds.has(item.id)) {
        keptIds.push(item.id);
        await db
          .update(questions)
          .set({
            orderIndex: idx,
            questionText: cleanStem,
            options: cleanedOptions,
            correctOptionIndex: correctIdx,
          })
          .where(
            and(eq(questions.id, item.id), eq(questions.quizId, quiz.id))
          );
      } else {
        const newId = generateId("q");
        keptIds.push(newId);
        await db.insert(questions).values({
          id: newId,
          quizId: quiz.id,
          orderIndex: idx,
          questionText: cleanStem,
          options: cleanedOptions,
          correctOptionIndex: correctIdx,
        });
      }
    }

    if (keptIds.length > 0) {
      await db
        .delete(questions)
        .where(
          and(
            eq(questions.quizId, quiz.id),
            notInArray(questions.id, keptIds)
          )
        );
    }

    await recalculateQuizScores(quiz.id);

    await db
      .update(quizzes)
      .set({ updatedAt: new Date() })
      .where(eq(quizzes.id, quiz.id));

    return NextResponse.json({ ok: true, count: keptIds.length });
  } catch (error) {
    console.error("PUT /api/admin/quiz/[slug]/questions error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء حفظ تعديلات الأسئلة." },
      { status: 500 }
    );
  }
}
