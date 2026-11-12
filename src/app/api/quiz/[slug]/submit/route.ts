import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { computeScore } from "@/lib/quiz-service";
import { isBeforeStart } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));

    const token =
      req.headers.get("x-session-token")?.trim() ||
      body.sessionToken?.trim() ||
      req.cookies.get(`quiz_session_${slug}`)?.value?.trim();

    if (!token) {
      return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
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
      return NextResponse.json({ error: "الجلسة غير موجودة." }, { status: 404 });
    }

    const participant = pRows[0];

    if (
      participant.status === "in_progress" &&
      isBeforeStart(quiz.startsAt)
    ) {
      return NextResponse.json(
        { error: "الكويز لم يبدأ بعد.", notStarted: true },
        { status: 403 }
      );
    }

    if (participant.status !== "in_progress") {
      return NextResponse.json({
        ok: true,
        alreadySubmitted: true,
        resultsPublished: quiz.resultsPublished,
      });
    }

    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));

    const now = new Date();
    const maxSeconds = quiz.durationMinutes * 60;
    const elapsedSeconds = Math.min(
      maxSeconds,
      Math.max(
        1,
        Math.round(
          (now.getTime() - new Date(participant.startedAt).getTime()) / 1000
        )
      )
    );

    const finalScore = computeScore(participant.answers ?? {}, qList);

    await db
      .update(participants)
      .set({
        status: "submitted",
        score: finalScore,
        totalQuestions: qList.length,
        submittedAt: now,
        timeTakenSeconds: elapsedSeconds,
      })
      .where(eq(participants.id, participant.id));

    return NextResponse.json({
      ok: true,
      status: "submitted",
      resultsPublished: quiz.resultsPublished,
    });
  } catch (error) {
    console.error("POST /api/quiz/[slug]/submit error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسليم الاختبار." },
      { status: 500 }
    );
  }
}
