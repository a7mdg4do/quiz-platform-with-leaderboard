import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { quizzes, questions, participants } from "@/db/schema";
import { desc, eq, asc } from "drizzle-orm";
import {
  ensureSeeded,
  syncExpiredParticipants,
  buildLeaderboard,
} from "@/lib/quiz-service";
import { DEFAULT_QUIZ_SLUG } from "@/lib/seed-data";
import LeaderboardCard from "@/components/LeaderboardCard";
import {
  Clock,
  Users,
  ArrowLeft,
  Settings,
  FileText,
  BookOpen,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let activeQuiz = {
    slug: DEFAULT_QUIZ_SLUG,
    title: "اختبار معمارية الحاسوب والذكاء الاصطناعي التوليدي",
    description:
      "اختبار تنافسي مكثف مكوّن من 10 أسئلة اختيار من متعدد لقياس الفهم العميق لمفاهيم الحوسبة الكمومية، الحوسبة الطرفية والسحابية، الشبكات العصبية، والذكاء الاصطناعي التوليدي.",
    durationMinutes: 10,
    maxParticipants: 5,
    isActive: true,
    resultsPublished: false,
    questionsCount: 10,
    participantsCount: 0,
    seatsRemaining: 5,
  };
  let leaderboardData = null;

  try {
    await ensureSeeded();
    const quizRows = await db
      .select()
      .from(quizzes)
      .orderBy(desc(quizzes.createdAt))
      .limit(1);

    if (quizRows.length > 0) {
      const qz = quizRows[0];
      const qList = await db
        .select()
        .from(questions)
        .where(eq(questions.quizId, qz.id))
        .orderBy(asc(questions.orderIndex));

      await syncExpiredParticipants(qz, qList);

      const pList = await db
        .select()
        .from(participants)
        .where(eq(participants.quizId, qz.id))
        .orderBy(asc(participants.startedAt));

      activeQuiz = {
        slug: qz.slug,
        title: qz.title,
        description: qz.description,
        durationMinutes: qz.durationMinutes,
        maxParticipants: qz.maxParticipants,
        isActive: qz.isActive,
        resultsPublished: qz.resultsPublished,
        questionsCount: qList.length,
        participantsCount: pList.length,
        seatsRemaining: Math.max(0, qz.maxParticipants - pList.length),
      };

      if (qz.resultsPublished) {
        leaderboardData = buildLeaderboard(pList, qList.length);
      }
    }
  } catch {
    // Fallback gracefully if DB tables are still being pushed on very first boot
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white shadow-2xs">
              م
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900">
                منصة مِقياس
              </span>
              <p className="text-xs text-slate-500">
                اختبارات تنافسية قصيرة ولوحة صدارة محكومة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/prd"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">وثيقة PRD</span>
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>لوحة تحكم المعلم</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        {/* Active Quiz Hero Card */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-teal-950 px-6 py-10 text-white sm:px-10 sm:py-12">
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 border border-teal-400/30 px-3 py-1 text-teal-200">
                <BookOpen className="h-3.5 w-3.5" />
                {activeQuiz.questionsCount} أسئلة اختيار من متعدد
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-slate-200">
                <Clock className="h-3.5 w-3.5" />
                المدة: {activeQuiz.durationMinutes} دقائق
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-slate-200">
                <Users className="h-3.5 w-3.5" />
                المقاعد المتاحة: {activeQuiz.seatsRemaining} من{" "}
                {activeQuiz.maxParticipants} طلاب
              </span>
            </div>

            <h1 className="mt-5 text-2xl font-bold leading-snug sm:text-4xl">
              {activeQuiz.title}
            </h1>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={`/q/${activeQuiz.slug}`}
                className="inline-flex items-center gap-2.5 rounded-2xl bg-teal-500 px-7 py-4 text-base font-bold text-slate-950 shadow-sm transition hover:bg-teal-400"
              >
                <span>
                  {activeQuiz.resultsPublished
                    ? "عرض لوحة الصدارة والنتيجة النهائية"
                    : "دخول الاختبار كطالب / متابعة النتيجة"}
                </span>
                <ArrowLeft className="h-5 w-5" />
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-bold text-white backdrop-blur-xs transition hover:bg-white/15"
              >
                <Settings className="h-4 w-4" />
                <span>إدارة الأسئلة ومشاركة الرابط</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Published Leaderboard if teacher turned it on */}
        {activeQuiz.resultsPublished && leaderboardData && (
          <section>
            <LeaderboardCard
              entries={leaderboardData}
              maxParticipants={activeQuiz.maxParticipants}
              quizTitle={activeQuiz.title}
            />
          </section>
        )}
      </main>
    </div>
  );
}
