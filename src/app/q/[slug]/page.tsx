"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Flag,
  Send,
  Lock,
  RefreshCw,
  Users,
  AlertTriangle,
  LogOut,
  KeyRound,
  UserPlus,
  BookOpen,
} from "lucide-react";
import LeaderboardCard, {
  type LeaderboardRow,
  formatDurationArabic,
} from "@/components/LeaderboardCard";

const ARABIC_OPTION_LABELS = ["أ", "ب", "ج", "د"];

interface PublicQuizInfo {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  maxParticipants: number;
  isActive: boolean;
  resultsPublished: boolean;
  questionsCount: number;
  participantsCount: number;
  completedCount: number;
  seatsRemaining: number;
  startsAt?: string | null;
  registrationOpensAt?: string | null;
  scheduleState?: "none" | "not_open" | "registration" | "started";
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDayAndTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

interface SafeQuestion {
  id: string;
  number: number;
  questionText: string;
  options: string[];
  selectedDisplayIndex: number | null;
}

interface ReviewQuestion extends SafeQuestion {
  correctDisplayIndex: number;
  isCorrect: boolean;
}

interface SessionData {
  authenticated: boolean;
  phase?: "in_progress" | "waiting" | "leaderboard" | "scheduled";
  serverNow?: string;
  quiz?: {
    title: string;
    slug: string;
    durationMinutes: number;
    maxParticipants: number;
    resultsPublished?: boolean;
    startsAt?: string | null;
  };
  participant?: {
    id: string;
    studentName: string;
    status?: string;
    startedAt?: string;
    expiresAt?: string;
    remainingSeconds?: number;
    answeredCount: number;
    totalQuestions: number;
    timeTakenSeconds?: number | null;
    submittedAt?: string | null;
    score?: number | null;
    rank?: number | null;
  };
  cohort?: {
    joinedCount: number;
    completedCount: number;
    maxParticipants: number;
  };
  questions?: SafeQuestion[];
  reviewQuestions?: ReviewQuestion[] | null;
  leaderboard?: LeaderboardRow[] | null;
}

export default function StudentQuizPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "cs-ai-2026";
  const storageKey = `miqyas_token_${slug}`;

  const [loading, setLoading] = useState(true);
  const [publicInfo, setPublicInfo] = useState<PublicQuizInfo | null>(null);
  const [publicLeaderboard, setPublicLeaderboard] = useState<
    LeaderboardRow[] | null
  >(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Join / Recover Form State
  const [entryMode, setEntryMode] = useState<"new" | "recover">("new");
  const [studentName, setStudentName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Active Exam UI State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flaggedIds, setFlaggedIds] = useState<Record<string, boolean>>({});
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const autoSubmitTriggeredRef = useRef(false);
  const deadlineMsRef = useRef<number | null>(null);

  // Answer Review UI State (Phase 4)
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<"all" | "wrong">("all");

  // Scheduled-start state: server/client clock offset + 1s tick for countdowns
  const serverOffsetRef = useRef(0);
  const lastScheduleFetchRef = useRef(0);
  const [scheduleNowMs, setScheduleNowMs] = useState(0);

  const getStoredToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(storageKey);
  }, [storageKey]);

  const fetchAllState = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const token = getStoredToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers["x-session-token"] = token;
        }

        const [pubRes, sessRes] = await Promise.all([
          fetch(`/api/quiz/${slug}`, { cache: "no-store" }),
          fetch(`/api/quiz/${slug}/session`, {
            cache: "no-store",
            headers,
          }),
        ]);

        if (!pubRes.ok) {
          const errData = await pubRes.json().catch(() => ({}));
          setErrorMsg(errData.error || "تعذر العثور على هذا الاختبار.");
          setLoading(false);
          return;
        }

        const pubData = await pubRes.json();
        if (typeof pubData.serverNow === "string") {
          const serverNowMs = Date.parse(pubData.serverNow);
          serverOffsetRef.current = serverNowMs - Date.now();
          setScheduleNowMs(serverNowMs);
        }
        setPublicInfo(pubData.quiz);
        setPublicLeaderboard(pubData.leaderboard || null);

        if (
          pubData.quiz.seatsRemaining === 0 ||
          pubData.quiz.resultsPublished ||
          !pubData.quiz.isActive
        ) {
          setEntryMode((prev) => (prev === "new" ? "recover" : prev));
        }

        if (sessRes.ok) {
          const sessData: SessionData = await sessRes.json();
          if (sessData.authenticated) {
            setSession(sessData);
            if (
              sessData.phase === "in_progress" &&
              typeof sessData.participant?.remainingSeconds === "number"
            ) {
              deadlineMsRef.current =
                Date.now() + sessData.participant.remainingSeconds * 1000;
              setRemainingSec(sessData.participant.remainingSeconds);
              autoSubmitTriggeredRef.current = false;
            } else {
              deadlineMsRef.current = null;
              setRemainingSec(null);
            }
          } else {
            setSession({ authenticated: false });
          }
        }
        setErrorMsg(null);
      } catch {
        if (!silent) {
          setErrorMsg("تعذر الاتصال بالخادم، يرجى التحقق من الاتصال والمحاولة مجدداً.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug, getStoredToken]
  );

  useEffect(() => {
    fetchAllState(false);
  }, [fetchAllState]);

  // Countdown tick for in_progress state
  useEffect(() => {
    if (session?.phase !== "in_progress") return;

    const timer = setInterval(() => {
      if (!deadlineMsRef.current) return;
      const diff = Math.max(
        0,
        Math.ceil((deadlineMsRef.current - Date.now()) / 1000)
      );
      setRemainingSec(diff);

      if (diff <= 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        handleFinalSubmit(true);
      }
    }, 500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.phase]);

  // Auto-poll in waiting lounge so leaderboard appears immediately when instructor publishes
  useEffect(() => {
    if (session?.phase !== "waiting") return;
    const poll = setInterval(() => {
      fetchAllState(true);
    }, 4000);
    return () => clearInterval(poll);
  }, [session?.phase, fetchAllState]);

  // Scheduled start: which moment are we counting down to (if any)?
  //  - registered student waiting         -> quiz start
  //  - not registered, before registration -> registration opening
  //  - not registered, registration window -> quiz start
  let scheduleTargetIso: string | null = null;
  if (session?.authenticated && session.phase === "scheduled") {
    scheduleTargetIso = session.quiz?.startsAt ?? null;
  } else if (!session?.authenticated && !publicInfo?.resultsPublished) {
    if (publicInfo?.scheduleState === "not_open") {
      scheduleTargetIso = publicInfo.registrationOpensAt ?? null;
    } else if (publicInfo?.scheduleState === "registration") {
      scheduleTargetIso = publicInfo.startsAt ?? null;
    }
  }

  // Tick every second; re-sync with the server when the target moment arrives
  // (or every 20s, to pick up schedule changes made by the instructor).
  useEffect(() => {
    if (!scheduleTargetIso) return;
    const targetMs = Date.parse(scheduleTargetIso);
    lastScheduleFetchRef.current = Date.now();

    const timer = setInterval(() => {
      const nowMs = Date.now() + serverOffsetRef.current;
      setScheduleNowMs(nowMs);
      const sinceFetch = Date.now() - lastScheduleFetchRef.current;
      if ((nowMs >= targetMs && sinceFetch > 2500) || sinceFetch > 20000) {
        lastScheduleFetchRef.current = Date.now();
        fetchAllState(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [scheduleTargetIso, fetchAllState]);

  const handleGeneratePin = () => {
    const random4 = String(Math.floor(1000 + Math.random() * 9000));
    setAccessCode(random4);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setJoining(true);

    try {
      const res = await fetch(`/api/quiz/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName,
          accessCode,
          mode: entryMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || "تعذر الدخول إلى الاختبار.");
        if (data.code === "not_started") {
          // Registration is not open yet: refresh to show the "not started" page.
          await fetchAllState(true);
        }
        setJoining(false);
        return;
      }

      if (data.sessionToken && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, data.sessionToken);
      }

      setCurrentIndex(0);
      await fetchAllState(false);
    } catch {
      setJoinError("حدث خطأ في الشبكة، حاول مرة أخرى.");
    } finally {
      setJoining(false);
    }
  };

  const handleSelectOption = async (
    questionId: string,
    displayIndex: number
  ) => {
    if (!session?.questions || session.phase !== "in_progress") return;

    // Optimistic UI update
    setSession((prev) => {
      if (!prev || !prev.questions) return prev;
      const updatedQuestions = prev.questions.map((q) =>
        q.id === questionId ? { ...q, selectedDisplayIndex: displayIndex } : q
      );
      const answeredCount = updatedQuestions.filter(
        (q) => q.selectedDisplayIndex !== null
      ).length;
      return {
        ...prev,
        questions: updatedQuestions,
        participant: prev.participant
          ? { ...prev.participant, answeredCount }
          : prev.participant,
      };
    });

    setSavingState("saving");
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/quiz/${slug}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-session-token": token } : {}),
        },
        body: JSON.stringify({
          questionId,
          selectedDisplayIndex: displayIndex,
          sessionToken: token,
        }),
      });

      if (res.status === 403) {
        await fetchAllState(true);
        return;
      }
      if (res.ok) {
        setSavingState("saved");
      }
    } catch {
      setSavingState("idle");
    }
  };

  const handleFinalSubmit = async (isAutoExpired = false) => {
    if (submitting) return;
    setSubmitting(true);
    setConfirmSubmitOpen(false);

    try {
      const token = getStoredToken();
      await fetch(`/api/quiz/${slug}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-session-token": token } : {}),
        },
        body: JSON.stringify({
          sessionToken: token,
          autoExpired: isAutoExpired,
        }),
      });
      await fetchAllState(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchStudentDevice = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
    await fetch(`/api/quiz/${slug}/session`, { method: "DELETE" }).catch(
      () => {}
    );
    setSession({ authenticated: false });
    setStudentName("");
    setAccessCode("");
    setJoinError(null);
    await fetchAllState(false);
  };

  const toggleFlag = (questionId: string) => {
    setFlaggedIds((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
        <p className="mt-4 text-sm font-medium text-slate-600">
          جاري تحميل الاختبار والتحقق من الجلسة...
        </p>
      </div>
    );
  }

  if (errorMsg || !publicInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            تعذر فتح الاختبار
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {errorMsg || "تأكد من صحة رابط الاختبار المرسل إليك."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SCHEDULED A: NOT REGISTERED YET + REGISTRATION NOT OPEN -> "QUIZ NOT STARTED"
  // ============================================================================
  if (
    !session?.authenticated &&
    !publicInfo.resultsPublished &&
    publicInfo.scheduleState === "not_open" &&
    publicInfo.startsAt &&
    publicInfo.registrationOpensAt
  ) {
    const secondsToRegistration = Math.max(
      0,
      Math.ceil((Date.parse(publicInfo.registrationOpensAt) - scheduleNowMs) / 1000)
    );

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-lg space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
              <Clock className="h-9 w-9" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              الكويز لم يبدأ بعد
            </h1>
            <p className="mt-1 text-sm font-semibold text-teal-700">
              {publicInfo.title}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              سيبدأ الكويز يوم{" "}
              <strong className="text-slate-900">
                {formatDayAndTime(publicInfo.startsAt)}
              </strong>
              . يُفتح تسجيل بيانات الطلاب قبل الموعد بـ 10 دقائق، أي الساعة{" "}
              <strong className="text-slate-900">
                {formatClockTime(publicInfo.registrationOpensAt)}
              </strong>
              .
            </p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">يُفتح التسجيل بعد</p>
              <p
                dir="ltr"
                className="mt-1 font-mono-num text-3xl font-bold tracking-wider text-slate-900"
              >
                {formatCountdown(secondsToRegistration)}
              </p>
            </div>

            <p className="mt-5 text-xs text-slate-500">
              لا حاجة لتحديث الصفحة، ستنتقل تلقائياً إلى صفحة التسجيل عند فتحه.
              (الأوقات المعروضة بتوقيت جهازك)
            </p>
          </div>

          <div className="text-center text-xs text-slate-500">
            <Link href="/" className="font-semibold hover:text-slate-800">
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SCHEDULED B: REGISTERED, WAITING FOR THE QUIZ START TIME
  // ============================================================================
  if (
    session?.authenticated &&
    session.phase === "scheduled" &&
    session.quiz?.startsAt
  ) {
    const startIso = session.quiz.startsAt;
    const secondsToStart = Math.max(
      0,
      Math.ceil((Date.parse(startIso) - scheduleNowMs) / 1000)
    );

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-lg space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 text-teal-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              تم تسجيل بياناتك يا {session.participant?.studentName}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              الكويز لم يبدأ بعد وسيبدأ تلقائياً الساعة{" "}
              <strong className="text-slate-900">
                {formatClockTime(startIso)}
              </strong>
              . أبقِ هذه الصفحة مفتوحة وستظهر لك الأسئلة فور البدء، ومدة الحل{" "}
              {session.quiz.durationMinutes} دقائق تُحسب من لحظة البدء.
            </p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">يبدأ الكويز بعد</p>
              <p
                dir="ltr"
                className="mt-1 font-mono-num text-4xl font-bold tracking-wider text-teal-700"
              >
                {formatCountdown(secondsToStart)}
              </p>
            </div>

            <p className="mt-5 text-xs text-slate-500">
              (الأوقات المعروضة بتوقيت جهازك)
            </p>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleSwitchStudentDevice}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>تبديل الطالب على هذا الجهاز</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE 2: ACTIVE EXAM VIEW (10 MINUTES, SHUFFLED QUESTIONS & OPTIONS)
  // ============================================================================
  if (
    session?.authenticated &&
    session.phase === "in_progress" &&
    session.questions &&
    session.questions.length > 0
  ) {
    const questionsList = session.questions;
    const safeIdx = Math.min(currentIndex, questionsList.length - 1);
    const activeQ = questionsList[safeIdx];
    const answeredCount = questionsList.filter(
      (q) => q.selectedDisplayIndex !== null
    ).length;
    const unansweredCount = questionsList.length - answeredCount;
    const secLeft = remainingSec ?? session.participant?.remainingSeconds ?? 600;
    const isLowTime = secLeft <= 120 && secLeft > 45;
    const isCriticalTime = secLeft <= 45;

    return (
      <div className="min-h-screen bg-slate-100/80 pb-16">
        {/* Sticky Exam Bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white font-bold text-sm">
                م
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 sm:text-base line-clamp-1">
                  {publicInfo.title}
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>الطالب: {session.participant?.studentName}</span>
                  <span>•</span>
                  <span>
                    {savingState === "saving"
                      ? "جاري الحفظ..."
                      : savingState === "saved"
                      ? "تم الحفظ تلقائياً ✓"
                      : "حفظ فوري مفعّل"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Countdown Timer */}
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 font-mono-num text-base font-bold transition-colors ${
                  isCriticalTime
                    ? "animate-pulse border-rose-300 bg-rose-50 text-rose-700"
                    : isLowTime
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>{formatDurationArabic(secLeft)}</span>
              </div>

              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-4 w-4" />
                <span>تسليم ({answeredCount}/{questionsList.length})</span>
              </button>
            </div>
          </div>

          {/* Thin Progress Strip */}
          <div className="h-1 w-full bg-slate-100">
            <div
              className="h-full bg-teal-600 transition-all duration-300"
              style={{
                width: `${Math.round(
                  (answeredCount / questionsList.length) * 100
                )}%`,
              }}
            />
          </div>
        </header>

        <main className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
          {/* Question Number Pills */}
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-2.5 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                خريطة الأسئلة (ترتيب خاص بك)
              </span>
              <span>
                أجبت على{" "}
                <strong className="font-mono-num text-teal-700">
                  {answeredCount}
                </strong>{" "}
                من{" "}
                <strong className="font-mono-num">{questionsList.length}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {questionsList.map((q, idx) => {
                const isCurrent = idx === safeIdx;
                const isAnswered = q.selectedDisplayIndex !== null;
                const isFlagged = !!flaggedIds[q.id];

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl border font-mono-num text-sm font-bold transition cursor-pointer ${
                      isCurrent
                        ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                        : isAnswered
                        ? "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Question Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                السؤال {safeIdx + 1} من {questionsList.length}
              </span>

              <button
                type="button"
                onClick={() => toggleFlag(activeQ.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                  flaggedIds[activeQ.id]
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                <span>
                  {flaggedIds[activeQ.id]
                    ? "تم التحديد للمراجعة"
                    : "تحديد للمراجعة لاحقاً"}
                </span>
              </button>
            </div>

            {/* Question Stem */}
            <h2 className="mt-6 text-lg font-bold leading-relaxed text-slate-900 sm:text-xl sm:leading-loose">
              {activeQ.questionText}
            </h2>

            {/* Shuffled Options */}
            <div className="mt-6 space-y-3.5">
              {activeQ.options.map((optionText, optIdx) => {
                const isSelected = activeQ.selectedDisplayIndex === optIdx;
                const letter = ARABIC_OPTION_LABELS[optIdx] || String(optIdx + 1);

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(activeQ.id, optIdx)}
                    className={`group flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-right transition-all cursor-pointer sm:p-5 ${
                      isSelected
                        ? "border-teal-600 bg-teal-50/70 shadow-xs"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base font-bold transition-colors ${
                        isSelected
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-slate-300 bg-slate-50 text-slate-700 group-hover:border-slate-400"
                      }`}
                    >
                      {letter}
                    </span>
                    <span
                      className={`pt-1 text-base leading-relaxed ${
                        isSelected
                          ? "font-semibold text-slate-950"
                          : "text-slate-800"
                      }`}
                    >
                      {optionText}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={safeIdx === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
                <span>السؤال السابق</span>
              </button>

              {safeIdx < questionsList.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((i) =>
                      Math.min(questionsList.length - 1, i + 1)
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  <span>السؤال التالي</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-700 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>إنهاء وتسليم الاختبار</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Confirm Submit Modal */}
        {confirmSubmitOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900">
                تأكيد تسليم إجابات الاختبار
              </h3>
              {unansweredCount > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
                  تنبيه: لديك{" "}
                  <strong className="font-mono-num">{unansweredCount}</strong>{" "}
                  أسئلة لم تقم بالإجابة عليها بعد. هل تود المراجعة قبل التسليم؟
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  لقد أجبت على جميع الأسئلة ({questionsList.length} من{" "}
                  {questionsList.length}). بعد التسليم ستُحفظ إجاباتك نهائياً
                  ولن تظهر الدرجة إلا عند إعلان المعلم للوحة الصدارة.
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  العودة للمراجعة
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalSubmit(false)}
                  disabled={submitting}
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "جاري التسليم..." : "نعم، تسليم نهائي"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // PHASE 3: SECRET WAITING LOUNGE (SUBMITTED, RESULTS NOT YET PUBLISHED)
  // ============================================================================
  if (session?.authenticated && session.phase === "waiting") {
    const p = session.participant!;
    const cohort = session.cohort ?? {
      joinedCount: publicInfo.participantsCount,
      completedCount: publicInfo.completedCount,
      maxParticipants: publicInfo.maxParticipants,
    };

    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Top Brand */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-teal-700"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                م
              </span>
              <span>منصة مِقياس</span>
            </Link>
            <button
              type="button"
              onClick={() => fetchAllState(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تحديث الحالة</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 border border-teal-200">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              تم تسجيل إجاباتك بنجاح يا {p.studentName}!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 max-w-lg mx-auto">
              تم حفظ إجاباتك في قاعدة البيانات. بناءً على إعدادات هذا الاختبار،{" "}
              <strong className="text-slate-900">
                لا تظهر الدرجة الفردية عقب الحل مباشرة
              </strong>
              ، بل ستظهر في{" "}
              <strong className="text-teal-700">
                لوحة الصدارة (الترتيب 1 – {cohort.maxParticipants})
              </strong>{" "}
              فور قرار المعلم بإعلان النتائج.
            </p>

            {/* Summary Pills (NO SCORE SHOWN!) */}
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">الأسئلة المجابة</p>
                <p className="mt-1 font-mono-num text-lg font-bold text-slate-900">
                  {p.answeredCount} / {p.totalQuestions}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">زمن الإنجاز المسجل</p>
                <p className="mt-1 font-mono-num text-lg font-bold text-slate-900">
                  {formatDurationArabic(p.timeTakenSeconds)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-xs text-amber-800">حالة النتيجة</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-amber-900">
                  <Lock className="h-4 w-4" />
                  <span>بانتظار إعلان المعلم</span>
                </p>
              </div>
            </div>

            {/* Live Cohort Progress */}
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-right">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <Users className="h-4 w-4 text-teal-600" />
                  حالة المجموعة الحالية
                </span>
                <span className="font-mono-num text-xs font-bold text-slate-600">
                  أنهى {cohort.completedCount} من {cohort.maxParticipants} طلاب
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (cohort.completedCount /
                          Math.max(1, cohort.maxParticipants)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                تتحدث هذه الصفحة تلقائياً كل بضع ثوانٍ — ويمكنك أيضاً إغلاق
                الصفحة والعودة لنفس الرابط لاحقاً لمشاهدة ترتيبك فور نشره.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <button
              type="button"
              onClick={handleSwitchStudentDevice}
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>تبديل الطالب على هذا الجهاز</span>
            </button>
            <Link href="/dashboard" className="hover:text-teal-700 font-medium">
              دخول لوحة تحكم المعلم
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE 4: PUBLISHED LEADERBOARD VIEW (FOR LOGGED-IN STUDENT)
  // ============================================================================
  if (
    session?.authenticated &&
    session.phase === "leaderboard" &&
    session.leaderboard
  ) {
    const p = session.participant!;
    const reviewList = session.reviewQuestions ?? [];
    const wrongQuestions = reviewList.filter((q) => !q.isCorrect);
    const correctCount = reviewList.length - wrongQuestions.length;
    const displayedReview =
      reviewFilter === "wrong" && wrongQuestions.length > 0
        ? wrongQuestions
        : reviewList;
    const safeReviewIdx = Math.min(
      reviewIndex,
      Math.max(0, displayedReview.length - 1)
    );
    const activeReviewQ = displayedReview[safeReviewIdx];

    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-teal-700"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                م
              </span>
              <span>منصة مِقياس</span>
            </Link>

            <button
              type="button"
              onClick={handleSwitchStudentDevice}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>تبديل الطالب</span>
            </button>
          </div>

          {/* Personal Result Highlight Banner */}
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-l from-teal-50 via-white to-emerald-50 p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  تم إعلان النتائج الرسمية
                </span>
                <h1 className="mt-2.5 text-xl font-bold text-slate-900">
                  مرحباً {p.studentName} — حصلت على المركز #{p.rank}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  زمن الإنجاز: {formatDurationArabic(p.timeTakenSeconds)}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-200 bg-white px-6 py-3 text-center shadow-2xs">
                <p className="text-xs text-slate-500">درجتك النهائية</p>
                <p className="mt-0.5 font-mono-num text-3xl font-bold text-teal-700">
                  {p.score}{" "}
                  <span className="text-lg text-slate-400">
                    / {p.totalQuestions}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Question-by-Question Answer Review */}
          {reviewList.length > 0 && activeReviewQ && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    مراجعة إجاباتك ومعرفة الأخطاء
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {correctCount} إجابة صحيحة
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-rose-700">
                      <XCircle className="h-3.5 w-3.5" />
                      {wrongQuestions.length} أخطاء / بدون إجابة
                    </span>
                  </div>
                </div>

                {wrongQuestions.length > 0 && (
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewFilter("all");
                        setReviewIndex(0);
                      }}
                      className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
                        reviewFilter === "all"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      الكل ({reviewList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewFilter("wrong");
                        setReviewIndex(0);
                      }}
                      className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
                        reviewFilter === "wrong"
                          ? "bg-white text-rose-700 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      الأخطاء فقط ({wrongQuestions.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Numbered Question Navigator Pills */}
              <div className="flex flex-wrap gap-2">
                {displayedReview.map((rq, idx) => {
                  const isCurrent = idx === safeReviewIdx;
                  return (
                    <button
                      key={rq.id}
                      type="button"
                      onClick={() => setReviewIndex(idx)}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 font-mono-num text-xs font-bold transition cursor-pointer ${
                        rq.isCorrect
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      } ${isCurrent ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
                    >
                      {rq.number}
                    </button>
                  );
                })}
              </div>

              {/* Active Question Card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">
                    سؤال {activeReviewQ.number} من {reviewList.length}
                  </span>
                  {activeReviewQ.isCorrect ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      إجابتك صحيحة
                    </span>
                  ) : activeReviewQ.selectedDisplayIndex === null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      لم تُجب على هذا السؤال
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                      <XCircle className="h-3.5 w-3.5" />
                      إجابة خاطئة
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold leading-relaxed text-slate-900 sm:text-lg">
                  {activeReviewQ.questionText}
                </h3>

                <div className="space-y-2.5">
                  {activeReviewQ.options.map((optText, optIdx) => {
                    const isCorrectOpt =
                      optIdx === activeReviewQ.correctDisplayIndex;
                    const isStudentChoice =
                      optIdx === activeReviewQ.selectedDisplayIndex;

                    let cardStyle =
                      "border-slate-200 bg-white text-slate-700";
                    let badgeStyle =
                      "border-slate-200 bg-slate-100 text-slate-600";

                    if (isCorrectOpt) {
                      cardStyle =
                        "border-emerald-500 bg-emerald-50/80 text-emerald-950 font-semibold";
                      badgeStyle =
                        "border-emerald-500 bg-emerald-600 text-white";
                    } else if (isStudentChoice && !isCorrectOpt) {
                      cardStyle =
                        "border-rose-400 bg-rose-50/80 text-rose-950";
                      badgeStyle = "border-rose-500 bg-rose-600 text-white";
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3.5 text-sm ${cardStyle}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${badgeStyle}`}
                          >
                            {ARABIC_OPTION_LABELS[optIdx] ?? optIdx + 1}
                          </span>
                          <span className="leading-relaxed">{optText}</span>
                        </div>

                        {isCorrectOpt && isStudentChoice && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            إجابتك (صحيحة)
                          </span>
                        )}
                        {isCorrectOpt && !isStudentChoice && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            الإجابة الصحيحة
                          </span>
                        )}
                        {isStudentChoice && !isCorrectOpt && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
                            <XCircle className="h-3.5 w-3.5" />
                            إجابتك
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prev / Next Question Flip Controls */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setReviewIndex((i) => Math.max(0, i - 1))}
                  disabled={safeReviewIdx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span>السابق</span>
                </button>

                <span className="font-mono-num text-xs font-bold text-slate-500">
                  {safeReviewIdx + 1} / {displayedReview.length}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setReviewIndex((i) =>
                      Math.min(displayedReview.length - 1, i + 1)
                    )
                  }
                  disabled={safeReviewIdx >= displayedReview.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>التالي</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <LeaderboardCard
            entries={session.leaderboard}
            maxParticipants={publicInfo.maxParticipants}
            highlightParticipantId={p.id}
            quizTitle={publicInfo.title}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE 1: JOIN / RETURNING STUDENT SCREEN (+ PUBLIC LEADERBOARD IF PUBLISHED)
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-base font-bold text-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white font-bold">
              م
            </span>
            <span>مِقياس للاختبارات المعيارية</span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            لوحة تحكم المعلم
          </Link>
        </div>

        {/* If results are already published, show Leaderboard right away! */}
        {publicInfo.resultsPublished && publicLeaderboard && (
          <LeaderboardCard
            entries={publicLeaderboard}
            maxParticipants={publicInfo.maxParticipants}
            quizTitle={publicInfo.title}
          />
        )}

        {/* Quiz Entry Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-900 p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-teal-300">
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/20 border border-teal-400/30 px-3 py-1">
                <BookOpen className="h-3.5 w-3.5" />
                {publicInfo.questionsCount} أسئلة MCQ
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-slate-200">
                <Clock className="h-3.5 w-3.5" />
                المدة: {publicInfo.durationMinutes} دقائق
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-slate-200">
                <Users className="h-3.5 w-3.5" />
                المقاعد المتبقية: {publicInfo.seatsRemaining} من{" "}
                {publicInfo.maxParticipants}
              </span>
            </div>

            <h1 className="mt-4 text-2xl font-bold leading-snug sm:text-3xl">
              {publicInfo.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {publicInfo.description}
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Registration window: registration is open but quiz hasn't started */}
            {publicInfo.scheduleState === "registration" &&
              publicInfo.startsAt && (
                <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-center">
                  <p className="text-sm font-bold text-teal-900">
                    التسجيل مفتوح — الكويز يبدأ الساعة{" "}
                    {formatClockTime(publicInfo.startsAt)}
                  </p>
                  <p
                    dir="ltr"
                    className="mt-1 font-mono-num text-2xl font-bold tracking-wider text-teal-800"
                  >
                    {formatCountdown(
                      Math.max(
                        0,
                        Math.ceil(
                          (Date.parse(publicInfo.startsAt) - scheduleNowMs) /
                            1000
                        )
                      )
                    )}
                  </p>
                  <p className="mt-1 text-xs text-teal-800">
                    سجّل بياناتك الآن وانتظر، وسيبدأ الحل تلقائياً عند الموعد.
                  </p>
                </div>
              )}

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setEntryMode("new");
                  setJoinError(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition cursor-pointer ${
                  entryMode === "new"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserPlus className="h-4 w-4" />
                <span>طالب جديد (بدء الحل)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode("recover");
                  setJoinError(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition cursor-pointer ${
                  entryMode === "recover"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <KeyRound className="h-4 w-4" />
                <span>طالب مسجل / عرض النتيجة</span>
              </button>
            </div>

            {/* Quiz Rules Banner */}
            {entryMode === "new" && (
              <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700 sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
                  <span>
                    ترتيب الأسئلة ومواضع الاختيارات يتغير عشوائياً لكل طالب.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
                  <span>
                    {publicInfo.scheduleState === "registration" &&
                    publicInfo.startsAt
                      ? `يبدأ الكويز تلقائياً الساعة ${formatClockTime(
                          publicInfo.startsAt
                        )}، وتُحسب مدة الـ ${
                          publicInfo.durationMinutes
                        } دقائق من لحظة البدء مع حفظ تلقائي.`
                      : `يبدأ مؤقت الـ ${publicInfo.durationMinutes} دقائق فور الضغط على بدء الاختبار مع حفظ تلقائي.`}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
                  <span>
                    تُحجب النتيجة بعد الحل وتظهر فقط في لوحة الصدارة (1–
                    {publicInfo.maxParticipants}) عندما يقرر المعلم.
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-800">
                  اسم الطالب الكامل
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="مثال: أحمد محمد عبدالله"
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-bold text-slate-800">
                    {entryMode === "new"
                      ? "اختر رمزاً سرياً بسيطاً (4 أرقام)"
                      : "رمزك السري الذي سجلت به (4 أرقام)"}
                  </label>
                  {entryMode === "new" && (
                    <button
                      type="button"
                      onClick={handleGeneratePin}
                      className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                    >
                      توليد 4 أرقام تلقائياً
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="مثال: 1234"
                  maxLength={12}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono-num text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  {entryMode === "new"
                    ? "يُستخدم هذا الرمز لحمايتك وتمكينك من الدخول لاحقاً من أي جهاز لمشاهدة النتيجة عند إعلانها."
                    : "أدخل نفس الاسم والرمز لفتح جلستك المحفوظة أو مشاهدة ترتيبك في لوحة الصدارة."}
                </p>
              </div>

              {joinError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                  {joinError}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  joining ||
                  (entryMode === "new" &&
                    (!publicInfo.isActive || publicInfo.seatsRemaining <= 0))
                }
                className="w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-600 cursor-pointer disabled:cursor-not-allowed"
              >
                {joining
                  ? "جاري التحقق..."
                  : entryMode === "recover"
                  ? "استعادة الجلسة / عرض النتيجة"
                  : !publicInfo.isActive
                  ? "التسجيل الجديد مغلق من المعلم"
                  : publicInfo.seatsRemaining <= 0
                  ? `اكتمل عدد الطلاب (${publicInfo.maxParticipants}) — ادخل من تبويب طالب مسجل`
                  : publicInfo.scheduleState === "registration"
                  ? "تسجيل بياناتي وانتظار بدء الكويز"
                  : `بدء الاختبار الآن (${publicInfo.durationMinutes} دقائق)`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
