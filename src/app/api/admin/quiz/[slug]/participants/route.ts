import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, participants } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureSeeded, isAuthorizedInstructor } from "@/lib/quiz-service";

export const dynamic = "force-dynamic";

function getAdminPin(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim()
  );
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
