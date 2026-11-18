import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  quizzes,
  questions,
  participants,
  type Participant,
  type Question,
  type Quiz,
} from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import {
  ensureSeeded,
  syncExpiredParticipants,
  buildLeaderboard,
  computeParticipantTotals,
  getQuestionScoreBreakdown,
} from "@/lib/quiz-service";
import { getScheduleInfo } from "@/lib/schedule";

export const dynamic = "force-dynamic";

function extractToken(req: NextRequest, slug: string): string | null {
  const headerToken = req.headers.get("x-session-token")?.trim();
  if (headerToken) return headerToken;
  const queryToken = req.nextUrl.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;
  const cookieToken = req.cookies.get(`quiz_session_${slug}`)?.value?.trim();
  if (cookieToken) return cookieToken;
  return null;
}

function buildStudentQuestions(
  quiz: Pick<Quiz, "gradingMode">,
  participant: Participant,
  qList: Question[],
  includeCorrectAnswers: boolean
) {
  const qMap = new Map(qList.map((q) => [q.id, q]));
  const orderedIds =
    participant.questionOrder && participant.questionOrder.length > 0
      ? participant.questionOrder.filter((id) => qMap.has(id))
      : qList.map((q) => q.id);

  // Include any newly added questions by instructor if not in original order
  for (const q of qList) {
    if (!orderedIds.includes(q.id)) {
      orderedIds.push(q.id);
    }
  }

  return orderedIds.map((qId, displayNumber) => {
    const q = qMap.get(qId)!;
    const questionType = q.questionType === "essay" ? "essay" : "mcq";
    const points = Math.max(1, q.points ?? 1);
    const imageUrl = q.imageUrl || null;
    const imageCaption = imageUrl ? q.imageCaption || null : null;

    if (questionType === "essay") {
      const essayAnswer = participant.essayAnswers?.[qId] ?? "";
      if (!includeCorrectAnswers) {
        return {
          id: q.id,
          number: displayNumber + 1,
          questionType,
          points,
          questionText: q.questionText,
          imageUrl,
          imageCaption,
          options: [] as string[],
          selectedDisplayIndex: null,
          essayAnswer,
        };
      }

      const bd = getQuestionScoreBreakdown(q, participant, quiz.gradingMode);
      return {
        id: q.id,
        number: displayNumber + 1,
        questionType,
        points,
        questionText: q.questionText,
        imageUrl,
        imageCaption,
        options: [] as string[],
        selectedDisplayIndex: null,
        essayAnswer,
        modelAnswer: q.modelAnswer || null,
        earnedPoints: bd.earnedPoints,
        maxPoints: bd.maxPoints,
        isGraded: bd.isGraded,
        feedback: participant.manualFeedback?.[qId] || null,
        isCorrect: bd.isGraded && bd.earnedPoints >= bd.maxPoints,
      };
    }

    const perm =
      participant.optionOrders?.[qId] &&
      participant.optionOrders[qId].length === q.options.length
        ? participant.optionOrders[qId]
        : q.options.map((_, i) => i);

    const shuffledOptions = perm.map((origIdx) => q.options[origIdx]);
    const savedOrigIdx = participant.answers?.[qId];
    const selectedDisplayIndex =
      typeof savedOrigIdx === "number" ? perm.indexOf(savedOrigIdx) : -1;
    const selectedVal = selectedDisplayIndex >= 0 ? selectedDisplayIndex : null;

    if (!includeCorrectAnswers) {
      return {
        id: q.id,
        number: displayNumber + 1,
        questionType,
        points,
        questionText: q.questionText,
        imageUrl,
        imageCaption,
        options: shuffledOptions,
        selectedDisplayIndex: selectedVal,
      };
    }

    const correctDisplayIndex = perm.indexOf(q.correctOptionIndex);
    const bd = getQuestionScoreBreakdown(q, participant, quiz.gradingMode);
    return {
      id: q.id,
      number: displayNumber + 1,
      questionType,
      points,
      questionText: q.questionText,
      imageUrl,
      imageCaption,
      options: shuffledOptions,
      selectedDisplayIndex: selectedVal,
      correctDisplayIndex: correctDisplayIndex >= 0 ? correctDisplayIndex : 0,
      earnedPoints: bd.earnedPoints,
      maxPoints: bd.maxPoints,
      isGraded: bd.isGraded,
      feedback: participant.manualFeedback?.[qId] || null,
      isCorrect: bd.isGraded && bd.earnedPoints >= bd.maxPoints,
    };
  });
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
      return NextResponse.json(
        { error: "الاختبار غير موجود." },
        { status: 404 }
      );
    }

    const quiz = quizRows[0];
    const token = extractToken(req, slug);

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));

    await syncExpiredParticipants(quiz, qList);

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
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const participant = pRows[0];
    const now = new Date();

    // Registered, but the quiz has not started yet: never send any questions.
    const schedule = getScheduleInfo(quiz.startsAt, now);
    if (
      participant.status === "in_progress" &&
      (schedule.state === "not_open" || schedule.state === "registration")
    ) {
      return NextResponse.json({
        authenticated: true,
        phase: "scheduled",
        serverNow: now.toISOString(),
        quiz: {
          title: quiz.title,
          slug: quiz.slug,
          durationMinutes: quiz.durationMinutes,
          maxParticipants: quiz.maxParticipants,
          startsAt: schedule.startsAt!.toISOString(),
        },
        participant: {
          id: participant.id,
          studentName: participant.studentName,
          answeredCount: 0,
          totalQuestions: qList.length,
        },
      });
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(participant.expiresAt).getTime() - now.getTime()) / 1000)
    );

    const allParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.quizId, quiz.id))
      .orderBy(asc(participants.startedAt));

    const completedCount = allParticipants.filter(
      (p) => p.status !== "in_progress"
    ).length;

    const totals = computeParticipantTotals(quiz, participant, qList);

    if (participant.status === "in_progress" && remainingSeconds > 0) {
      const safeQuestions = buildStudentQuestions(
        quiz,
        participant,
        qList,
        false
      );

      return NextResponse.json({
        authenticated: true,
        phase: "in_progress",
        serverNow: now.toISOString(),
        quiz: {
          title: quiz.title,
          slug: quiz.slug,
          durationMinutes: quiz.durationMinutes,
          maxParticipants: quiz.maxParticipants,
        },
        participant: {
          id: participant.id,
          studentName: participant.studentName,
          startedAt: new Date(participant.startedAt).toISOString(),
          expiresAt: new Date(participant.expiresAt).toISOString(),
          remainingSeconds,
          answeredCount: totals.answeredCount,
          totalQuestions: safeQuestions.length,
        },
        questions: safeQuestions,
      });
    }

    // Participant has finished (submitted or expired)
    // CRITICAL REQUIREMENT: Never expose score or leaderboard until instructor sets resultsPublished = true
    const leaderboard = quiz.resultsPublished
      ? buildLeaderboard(allParticipants, qList, quiz)
      : null;

    const myLeaderboardEntry = leaderboard
      ? leaderboard.find((item) => item.participantId === participant.id) ?? null
      : null;

    return NextResponse.json({
      authenticated: true,
      phase: quiz.resultsPublished ? "leaderboard" : "waiting",
      serverNow: now.toISOString(),
      quiz: {
        title: quiz.title,
        slug: quiz.slug,
        durationMinutes: quiz.durationMinutes,
        maxParticipants: quiz.maxParticipants,
        resultsPublished: quiz.resultsPublished,
        gradingMode: quiz.gradingMode,
      },
      participant: {
        id: participant.id,
        studentName: participant.studentName,
        status: participant.status,
        answeredCount: totals.answeredCount,
        totalQuestions: qList.length,
        maxScore: totals.maxScore,
        pendingGradingCount: quiz.resultsPublished
          ? totals.pendingGradingCount
          : undefined,
        timeTakenSeconds: participant.timeTakenSeconds,
        submittedAt: participant.submittedAt
          ? new Date(participant.submittedAt).toISOString()
          : null,
        // Strictly hidden until published!
        score: quiz.resultsPublished ? participant.score : null,
        rank: myLeaderboardEntry ? myLeaderboardEntry.rank : null,
      },
      cohort: {
        joinedCount: allParticipants.length,
        completedCount,
        maxParticipants: quiz.maxParticipants,
      },
      leaderboard,
      reviewQuestions: quiz.resultsPublished
        ? buildStudentQuestions(quiz, participant, qList, true)
        : null,
    });
  } catch (error) {
    console.error("GET /api/quiz/[slug]/session error:", error);
    return NextResponse.json(
      { error: "تعذر جلب جلسة الطالب." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(`quiz_session_${slug}`);
  return res;
}
