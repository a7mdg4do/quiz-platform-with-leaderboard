import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { computeScore } from "@/lib/quiz-service";

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
    const selectedDisplayIndex =
      typeof body.selectedDisplayIndex === "number"
        ? body.selectedDisplayIndex
        : -1;

    if (!questionId || selectedDisplayIndex < 0 || selectedDisplayIndex > 3) {
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
    const expiresAtMs = new Date(participant.expiresAt).getTime();

    // 3-second grace window for in-flight requests right at 00:00
    if (participant.status !== "in_progress" || now.getTime() > expiresAtMs + 3000) {
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

    const perm =
      participant.optionOrders?.[questionId] &&
      participant.optionOrders[questionId].length === targetQuestion.options.length
        ? participant.optionOrders[questionId]
        : targetQuestion.options.map((_, i) => i);

    const canonicalOptionIndex = perm[selectedDisplayIndex];
    if (typeof canonicalOptionIndex !== "number") {
      return NextResponse.json({ error: "الخيار غير صالح." }, { status: 400 });
    }

    const updatedAnswers = {
      ...(participant.answers ?? {}),
      [questionId]: canonicalOptionIndex,
    };

    const updatedScore = computeScore(updatedAnswers, qList);

    await db
      .update(participants)
      .set({
        answers: updatedAnswers,
        score: updatedScore,
        totalQuestions: qList.length,
      })
      .where(eq(participants.id, participant.id));

    return NextResponse.json({
      ok: true,
      answeredCount: Object.keys(updatedAnswers).length,
    });
  } catch (error) {
    console.error("POST /api/quiz/[slug]/answer error:", error);
    return NextResponse.json(
      { error: "تعذر حفظ الإجابة." },
      { status: 500 }
    );
  }
}
