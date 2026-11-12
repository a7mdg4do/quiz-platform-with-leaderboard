import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  ensureSeeded,
  generateId,
  generateSessionToken,
  normalizeArabicName,
  shuffleArray,
  syncExpiredParticipants,
} from "@/lib/quiz-service";
import { getScheduleInfo } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeeded();
    const { slug } = await context.params;
    const body = await req.json();

    const rawName = typeof body.studentName === "string" ? body.studentName.trim() : "";
    const rawCode = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
    const mode = body.mode === "recover" ? "recover" : "new";

    if (rawName.length < 2) {
      return NextResponse.json(
        { error: "يرجى إدخال اسم الطالب بشكل صحيح (حرفين على الأقل)." },
        { status: 400 }
      );
    }

    if (rawCode.length < 3 || rawCode.length > 12) {
      return NextResponse.json(
        { error: "يرجى إدخال رمز شخصي بسيط (من 4 أرقام مثلاً) لحفظ جلستك والعودة للنتيجة لاحقاً." },
        { status: 400 }
      );
    }

    const quizRows = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.slug, slug))
      .limit(1);

    if (quizRows.length === 0) {
      return NextResponse.json(
        { error: "لم يتم العثور على هذا الاختبار." },
        { status: 404 }
      );
    }

    const quiz = quizRows[0];
    const qList = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex));

    if (qList.length === 0) {
      return NextResponse.json(
        { error: "لا توجد أسئلة مضافة في هذا الاختبار حالياً." },
        { status: 400 }
      );
    }

    await syncExpiredParticipants(quiz, qList);

    const existingList = await db
      .select()
      .from(participants)
      .where(eq(participants.quizId, quiz.id));

    const normName = normalizeArabicName(rawName);
    const existingStudent = existingList.find(
      (p) => p.normalizedName === normName
    );

    if (existingStudent) {
      if (existingStudent.accessCode !== rawCode) {
        return NextResponse.json(
          {
            error:
              "هذا الاسم مسجل بالفعل في الاختبار. إذا كنت نفس الطالب وتود متابعة الاختبار أو مشاهدة النتيجة، يرجى إدخال رمز الدخول الشخصي الصحيح الذي اخترته عند التسجيل.",
          },
          { status: 403 }
        );
      }

      const res = NextResponse.json({
        ok: true,
        resumed: true,
        sessionToken: existingStudent.sessionToken,
        participantId: existingStudent.id,
        studentName: existingStudent.studentName,
      });

      res.cookies.set(`quiz_session_${quiz.slug}`, existingStudent.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    if (mode === "recover") {
      return NextResponse.json(
        {
          error:
            "لم يتم العثور على طالب مسجل بهذا الاسم في هذا الاختبار. تأكد من كتابة الاسم كما سجلته أو اختر (بدء الاختبار كطالب جديد).",
        },
        { status: 404 }
      );
    }

    if (!quiz.isActive) {
      return NextResponse.json(
        {
          error:
            "تم إغلاق باب دخول طلاب جدد لهذا الاختبار من قِبل المعلم. إذا شاركت سابقاً يمكنك الدخول من تبويب (طالب مسجل مسبقاً).",
        },
        { status: 403 }
      );
    }

    const joinNow = new Date();
    const schedule = getScheduleInfo(quiz.startsAt, joinNow);
    if (schedule.state === "not_open") {
      return NextResponse.json(
        {
          error: "الكويز لم يبدأ بعد، والتسجيل لم يُفتح حتى الآن.",
          code: "not_started",
          startsAt: schedule.startsAt!.toISOString(),
          registrationOpensAt: schedule.registrationOpensAt!.toISOString(),
        },
        { status: 403 }
      );
    }

    if (existingList.length >= quiz.maxParticipants) {
      return NextResponse.json(
        {
          error: `اكتمل العدد المحدد للاختبار (${quiz.maxParticipants} طلاب). إذا كنت أحد الطلاب الخمسة المشاركين، انتقل إلى تبويب (مشاهدة النتيجة / طالب مسجل) وأدخل اسمك ورمزك.`,
        },
        { status: 403 }
      );
    }

    // Generate unique shuffled question order & shuffled option orders for this student
    const shuffledQuestionIds = shuffleArray(qList.map((q) => q.id));
    const optionOrders: Record<string, number[]> = {};
    for (const q of qList) {
      const indices = q.options.map((_, idx) => idx);
      optionOrders[q.id] = shuffleArray(indices);
    }

    // During the pre-start registration window the student's clock is anchored
    // to the scheduled start, so everyone begins (and ends) together.
    const now = new Date();
    const startedAt =
      schedule.state === "registration" && schedule.startsAt
        ? schedule.startsAt
        : now;
    const expiresAt = new Date(
      startedAt.getTime() + quiz.durationMinutes * 60 * 1000
    );
    const participantId = generateId("stu");
    const sessionToken = generateSessionToken();

    await db.insert(participants).values({
      id: participantId,
      quizId: quiz.id,
      studentName: rawName,
      normalizedName: normName,
      accessCode: rawCode,
      sessionToken,
      questionOrder: shuffledQuestionIds,
      optionOrders,
      answers: {},
      status: "in_progress",
      score: 0,
      totalQuestions: qList.length,
      startedAt,
      expiresAt,
    });

    const res = NextResponse.json({
      ok: true,
      resumed: false,
      sessionToken,
      participantId,
      studentName: rawName,
    });

    res.cookies.set(`quiz_session_${quiz.slug}`, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (error) {
    console.error("POST /api/quiz/[slug]/join error:", error);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع أثناء الانضمام للاختبار." },
      { status: 500 }
    );
  }
}
