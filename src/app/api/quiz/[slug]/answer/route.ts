import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { computeParticipantTotals } from "@/lib/quiz-service";
import { isBeforeStart } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json();

    const token =
      req.headers.get("x-session-token")?.trim() ||
      body.sessionToken?.trim() ||
      req.cookies.get(`quiz_session_${slug}`)?.value?.trim();

    if (!token) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
    }

    const questionId =
      typeof body.questionId === "string" ? body.questionId : "";

    if (!questionId) {
      return NextResponse.json(
        { error: "بيانات الإجابة غير صالحة." },
        { status: 400 }
      );
    }

    const quizRows = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.slug, slug))
      .limit(1);

    if (quizRows.length === 0) {
      return NextResponse.json({ error: "الاختبار غير موجود." }, { status: 404 });
    }
    const quiz = quizRows[0];

    const pRows = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.quizId, quiz.id),
          eq(participants.sessionToken, token)
        )
      )
      .limit(1);

    if (pRows.length === 0) {
      return NextResponse.json({ error: "الجلسة غير صالحة." }, { status: 401 });
    }

    const participant = pRows[0];
    const now = new Date();

    if (isBeforeStart(quiz.startsAt, now)) {
      return NextResponse.json(
        { error: "الكويز لم يبدأ بعد.", notStarted: true },
        { status: 403 }
      );
    }

    const expiresAtMs = new Date(participant.expiresAt).getTime();

    // 3-second grace window for in-flight requests right at 00:00
    if (
      participant.status !== "in_progress" ||
      now.getTime() > expiresAtMs + 3000
    ) {
      return NextResponse.json(
        { error: "انتهى وقت الاختبار المخصص لك.", expired: true },
        { status: 403 }
      );
    }

    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));

    const targetQuestion = qList.find((q) => q.id === questionId);
    if (!targetQuestion) {
      return NextResponse.json({ error: "السؤال غير موجود." }, { status: 404 });
    }

    let updatedAnswers = { ...(participant.answers ?? {}) };
    let updatedEssayAnswers = { ...(participant.essayAnswers ?? {}) };

    if (targetQuestion.questionType === "essay") {
      if (typeof body.essayText !== "string") {
        return NextResponse.json(
          { error: "نص الإجابة المقالية غير صالح." },
          { status: 400 }
        );
      }
      updatedEssayAnswers = {
        ...updatedEssayAnswers,
        [questionId]: body.essayText.slice(0, 10000),
      };
    } else {
      const selectedDisplayIndex =
        typeof body.selectedDisplayIndex === "number"
          ? body.selectedDisplayIndex
          : -1;

      if (selectedDisplayIndex < 0 || selectedDisplayIndex > 3) {
        return NextResponse.json(
          { error: "بيانات الإجابة غير صالحة." },
          { status: 400 }
        );
      }

      const perm =
        participant.optionOrders?.[questionId] &&
        participant.optionOrders[questionId].length ===
          targetQuestion.options.length
          ? participant.optionOrders[questionId]
          : targetQuestion.options.map((_, i) => i);

      const canonicalOptionIndex = perm[selectedDisplayIndex];
      if (typeof canonicalOptionIndex !== "number") {
        return NextResponse.json(
          { error: "الخيار غير صالح." },
          { status: 400 }
        );
      }

      updatedAnswers = {
        ...updatedAnswers,
        [questionId]: canonicalOptionIndex,
      };
    }

    const totals = computeParticipantTotals(
      quiz,
      {
        answers: updatedAnswers,
        essayAnswers: updatedEssayAnswers,
        manualScores: participant.manualScores ?? {},
      },
      qList
    );

    await db
      .update(participants)
      .set({
        answers: updatedAnswers,
        essayAnswers: updatedEssayAnswers,
        score: totals.score,
        totalQuestions: qList.length,
      })
      .where(eq(participants.id, participant.id));

    return NextResponse.json({
      ok: true,
      answeredCount: totals.answeredCount,
    });
  } catch (error) {
    console.error("POST /api/quiz/[slug]/answer error:", error);
    return NextResponse.json(
      { error: "تعذر حفظ الإجابة." },
      { status: 500 }
    );
  }
}
