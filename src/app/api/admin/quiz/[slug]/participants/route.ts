import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  ensureSeeded,
  isAuthorizedInstructor,
  computeParticipantTotals,
} from "@/lib/quiz-service";

export const dynamic = "force-dynamic";

function getAdminPin(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim()
  );
}

export async function PATCH(
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
    const participantId =
      typeof body.participantId === "string" ? body.participantId.trim() : "";

    if (!participantId) {
      return NextResponse.json(
        { error: "يرجى تحديد الطالب المطلوب تصحيح إجاباته." },
        { status: 400 }
      );
    }

    const pRows = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, participantId),
          eq(participants.quizId, quiz.id)
        )
      )
      .limit(1);

    if (pRows.length === 0) {
      return NextResponse.json(
        { error: "لم يتم العثور على الطالب." },
        { status: 404 }
      );
    }
    const participant = pRows[0];

    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));
    const qMap = new Map(qList.map((q) => [q.id, q]));

    const nextManualScores: Record<string, number> = {
      ...(participant.manualScores ?? {}),
    };
    if (body.manualScores && typeof body.manualScores === "object") {
      for (const [qId, rawScore] of Object.entries(
        body.manualScores as Record<string, unknown>
      )) {
        const targetQ = qMap.get(qId);
        if (!targetQ) continue;
        if (rawScore === null || rawScore === "" || rawScore === undefined) {
          delete nextManualScores[qId];
        } else if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
          const maxPts = Math.max(1, targetQ.points ?? 1);
          nextManualScores[qId] = Math.max(
            0,
            Math.min(maxPts, Math.round(rawScore))
          );
        }
      }
    }

    const nextManualFeedback: Record<string, string> = {
      ...(participant.manualFeedback ?? {}),
    };
    if (body.manualFeedback && typeof body.manualFeedback === "object") {
      for (const [qId, rawNote] of Object.entries(
        body.manualFeedback as Record<string, unknown>
      )) {
        if (!qMap.has(qId)) continue;
        const cleanNote =
          typeof rawNote === "string" ? rawNote.trim().slice(0, 1000) : "";
        if (cleanNote) {
          nextManualFeedback[qId] = cleanNote;
        } else {
          delete nextManualFeedback[qId];
        }
      }
    }

    const totals = computeParticipantTotals(
      quiz,
      {
        answers: participant.answers ?? {},
        essayAnswers: participant.essayAnswers ?? {},
        manualScores: nextManualScores,
      },
      qList
    );

    await db
      .update(participants)
      .set({
        manualScores: nextManualScores,
        manualFeedback: nextManualFeedback,
        score: totals.score,
        totalQuestions: qList.length,
      })
      .where(eq(participants.id, participant.id));

    return NextResponse.json({
      ok: true,
      score: totals.score,
      maxScore: totals.maxScore,
      pendingGradingCount: totals.pendingGradingCount,
    });
  } catch (error) {
    console.error("PATCH /api/admin/quiz/[slug]/participants error:", error);
    return NextResponse.json(
      { error: "تعذر حفظ درجات التصحيح اليدوي." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const participantId = req.nextUrl.searchParams.get("participantId")?.trim();
    const resetAll = req.nextUrl.searchParams.get("all") === "true";

    if (resetAll) {
      await db.delete(participants).where(eq(participants.quizId, quiz.id));
      await db
        .update(quizzes)
        .set({ resultsPublished: false, isActive: true, updatedAt: new Date() })
        .where(eq(quizzes.id, quiz.id));
      return NextResponse.json({ ok: true, resetAll: true });
    }

    if (participantId) {
      await db
        .delete(participants)
        .where(
          and(
            eq(participants.id, participantId),
            eq(participants.quizId, quiz.id)
          )
        );
      return NextResponse.json({ ok: true, deletedId: participantId });
    }

    return NextResponse.json(
      { error: "يرجى تحديد الطالب المراد حذفه أو اختيار إعادة ضبط الكل." },
      { status: 400 }
    );
  } catch (error) {
    console.error("DELETE /api/admin/quiz/[slug]/participants error:", error);
    return NextResponse.json(
      { error: "تعذر حذف المحاولة." },
      { status: 500 }
    );
  }
}
