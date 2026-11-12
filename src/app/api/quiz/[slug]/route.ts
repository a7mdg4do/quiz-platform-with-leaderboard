import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import {
  ensureSeeded,
  syncExpiredParticipants,
  buildLeaderboard,
} from "@/lib/quiz-service";
import { getScheduleInfo } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeeded();
    const { slug } = await context.params;

    let quizList =
      slug === "active"
        ? await db.select().from(quizzes).orderBy(desc(quizzes.createdAt)).limit(1)
        : await db.select().from(quizzes).where(eq(quizzes.slug, slug)).limit(1);

    if (quizList.length === 0) {
      return NextResponse.json(
        { error: "لم يتم العثور على الاختبار المطلوب." },
        { status: 404 }
      );
    }

    const quiz = quizList[0];

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

    const completedCount = pList.filter((p) => p.status !== "in_progress").length;
    const seatsRemaining = Math.max(0, quiz.maxParticipants - pList.length);

    const leaderboard = quiz.resultsPublished
      ? buildLeaderboard(pList, qList.length)
      : null;

    const now = new Date();
    const schedule = getScheduleInfo(quiz.startsAt, now);

    return NextResponse.json({
      serverNow: now.toISOString(),
      quiz: {
        id: quiz.id,
        slug: quiz.slug,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.durationMinutes,
        maxParticipants: quiz.maxParticipants,
        isActive: quiz.isActive,
        resultsPublished: quiz.resultsPublished,
        questionsCount: qList.length,
        participantsCount: pList.length,
        completedCount,
        seatsRemaining,
        startsAt: schedule.startsAt ? schedule.startsAt.toISOString() : null,
        registrationOpensAt: schedule.registrationOpensAt
          ? schedule.registrationOpensAt.toISOString()
          : null,
        scheduleState: schedule.state,
      },
      leaderboard,
    });
  } catch (error) {
    console.error("GET /api/quiz/[slug] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحميل بيانات الاختبار." },
      { status: 500 }
    );
  }
}
