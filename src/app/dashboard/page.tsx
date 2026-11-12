"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Users,
  FileEdit,
  Settings,
  Trophy,
  Lock,
  LogOut,
  Share2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import LeaderboardCard, {
  type LeaderboardRow,
  formatDurationArabic,
} from "@/components/LeaderboardCard";
import { DEFAULT_QUIZ_SLUG } from "@/lib/seed-data";

const ARABIC_LABELS = ["أ", "ب", "ج", "د"];

interface QuizSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  maxParticipants: number;
  isActive: boolean;
  resultsPublished: boolean;
  instructorPin: string;
  questionsCount?: number;
  participantsCount?: number;
}

interface EditableQuestion {
  id?: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
}

interface AdminParticipant {
  id: string;
  studentName: string;
  accessCode: string;
  status: string;
  score: number;
  totalQuestions: number;
  answeredCount: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  timeTakenSeconds: number | null;
  remainingSeconds: number;
}

export default function InstructorDashboardPage() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [usingDefaultPin, setUsingDefaultPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [quizzesList, setQuizzesList] = useState<QuizSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(DEFAULT_QUIZ_SLUG);

  const [quiz, setQuiz] = useState<QuizSummary | null>(null);
  const [questionsDraft, setQuestionsDraft] = useState<EditableQuestion[]>([]);
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [leaderboardPreview, setLeaderboardPreview] = useState<
    LeaderboardRow[]
  >([]);

  const [activeTab, setActiveTab] = useState<
    "monitor" | "questions" | "settings"
  >("monitor");
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishingToggle, setPublishingToggle] = useState(false);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Settings form state
  const [titleInput, setTitleInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [durationInput, setDurationInput] = useState(10);
  const [maxStudentsInput, setMaxStudentsInput] = useState(5);
  const [isActiveInput, setIsActiveInput] = useState(true);
  const [newPinInput, setNewPinInput] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const checkAuth = useCallback(async () => {
    setAuthChecking(true);
    try {
      const res = await fetch("/api/admin/auth", { cache: "no-store" });
      const data = await res.json();
      setAuthorized(!!data.authorized);
      setUsingDefaultPin(!!data.usingDefaultPin);
    } catch {
      setAuthorized(false);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  const loadQuizzesList = useCallback(async () => {
    const res = await fetch("/api/admin/quizzes", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const list: QuizSummary[] = data.quizzes || [];
      setQuizzesList(list);
      if (
        list.length > 0 &&
        !list.some((item) => item.slug === selectedSlug)
      ) {
        setSelectedSlug(list[0].slug);
      }
    }
  }, [selectedSlug]);

  const loadQuizDetails = useCallback(
    async (slugToLoad: string, preserveDirtyQuestions = false) => {
      const res = await fetch(`/api/admin/quiz/${slugToLoad}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const qz: QuizSummary = data.quiz;
      setQuiz(qz);
      setParticipants(data.participants || []);
      setLeaderboardPreview(data.leaderboardPreview || []);

      if (!preserveDirtyQuestions) {
        setQuestionsDraft(
          (data.questions || []).map(
            (q: {
              id: string;
              questionText: string;
              options: string[];
              correctOptionIndex: number;
            }) => ({
              id: q.id,
              questionText: q.questionText,
              options: [...q.options],
              correctOptionIndex: q.correctOptionIndex,
            })
          )
        );
        setQuestionsDirty(false);
        setTitleInput(qz.title);
        setDescInput(qz.description);
        setDurationInput(qz.durationMinutes);
        setMaxStudentsInput(qz.maxParticipants);
        setIsActiveInput(qz.isActive);
        setNewPinInput(qz.instructorPin);
      }
    },
    []
  );

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authorized) return;
    loadQuizzesList();
  }, [authorized, loadQuizzesList]);

  useEffect(() => {
    if (!authorized || !selectedSlug) return;
    loadQuizDetails(selectedSlug, false);
  }, [authorized, selectedSlug, loadQuizDetails]);

  // Live refresh of student monitor every 5s without overwriting unsaved question edits
  useEffect(() => {
    if (!authorized || !selectedSlug) return;
    const interval = setInterval(() => {
      loadQuizDetails(selectedSlug, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [authorized, selectedSlug, loadQuizDetails]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPinError(data.error || "الرمز السري غير صحيح.");
      return;
    }
    setAuthorized(true);
    setPinInput("");
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthorized(false);
  };

  const getShareUrl = () => {
    if (typeof window === "undefined") return `/q/${selectedSlug}`;
    return `${window.location.origin}/q/${selectedSlug}`;
  };

  const handleCopyLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      showToast("تم نسخ رابط الاختبار بنجاح!");
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showToast(url);
    }
  };

  const handleWhatsAppShare = () => {
    const url = getShareUrl();
    const text = `رابط الدخول لاختبار: ${quiz?.title || "الكويز"}\n• عدد الأسئلة: ${
      questionsDraft.length
    } أسئلة اختيار من متعدد\n• المدة: ${
      quiz?.durationMinutes || 10
    } دقائق\n• رابط البدء:\n${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleTogglePublish = async (
    publishState: boolean,
    forceFinalizeActive = false
  ) => {
    if (!quiz) return;
    setPublishingToggle(true);
    try {
      const res = await fetch(`/api/admin/quiz/${quiz.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultsPublished: publishState,
          forceFinalizeActive,
        }),
      });
      if (res.ok) {
        await loadQuizDetails(quiz.slug, questionsDirty);
        await loadQuizzesList();
        showToast(
          publishState
            ? "تم نشر لوحة الصدارة (1–5) وأصبحت مرئية لجميع الطلاب الآن!"
            : "تم إخفاء لوحة الصدارة عن الطلاب (وضع الانتظار السري)."
        );
      }
    } finally {
      setPublishingToggle(false);
    }
  };

  const handleCreateNewQuiz = async () => {
    setCreatingQuiz(true);
    try {
      const nextNum = quizzesList.length + 1;
      const res = await fetch("/api/admin/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `اختبار معمارية الحاسوب والذكاء الاصطناعي — مجموعة ${nextNum}`,
          durationMinutes: 10,
          maxParticipants: 5,
          copyDefaultQuestions: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadQuizzesList();
        setSelectedSlug(data.slug);
        showToast("تم إنشاء كويز جديد في قاعدة البيانات مع الأسئلة العشرة!");
      }
    } finally {
      setCreatingQuiz(false);
    }
  };

  const handleDeleteParticipant = async (participantId: string) => {
    if (!quiz) return;
    const res = await fetch(
      `/api/admin/quiz/${quiz.slug}/participants?participantId=${participantId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await loadQuizDetails(quiz.slug, questionsDirty);
      await loadQuizzesList();
      showToast("تم حذف محاولة الطالب وإتاحة المقعد.");
    }
  };

  const handleResetAllParticipants = async () => {
    if (!quiz) return;
    setConfirmResetOpen(false);
    const res = await fetch(
      `/api/admin/quiz/${quiz.slug}/participants?all=true`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await loadQuizDetails(quiz.slug, questionsDirty);
      await loadQuizzesList();
      showToast("تم تصفير جميع المحاولات وإعادة فتح المقاعد الخمسة وإخفاء النتائج.");
    }
  };

  // Question Editing Helpers
  const updateQuestionText = (qIdx: number, val: string) => {
    setQuestionsDirty(true);
    setQuestionsDraft((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, questionText: val } : q))
    );
  };

  const updateQuestionOption = (qIdx: number, optIdx: number, val: string) => {
    setQuestionsDirty(true);
    setQuestionsDraft((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const nextOpts = [...q.options];
        nextOpts[optIdx] = val;
        return { ...q, options: nextOpts };
      })
    );
  };

  const updateCorrectOption = (qIdx: number, correctIdx: number) => {
    setQuestionsDirty(true);
    setQuestionsDraft((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, correctOptionIndex: correctIdx } : q
      )
    );
  };

  const addNewQuestion = () => {
    setQuestionsDirty(true);
    setQuestionsDraft((prev) => [
      ...prev,
      {
        questionText: "",
        options: ["", "", "", ""],
        correctOptionIndex: 0,
      },
    ]);
  };

  const removeQuestion = (qIdx: number) => {
    if (questionsDraft.length <= 1) {
      showToast("يجب أن يحتوي الكويز على سؤال واحد على الأقل.");
      return;
    }
    setQuestionsDirty(true);
    setQuestionsDraft((prev) => prev.filter((_, i) => i !== qIdx));
  };

  const moveQuestion = (qIdx: number, dir: -1 | 1) => {
    const target = qIdx + dir;
    if (target < 0 || target >= questionsDraft.length) return;
    setQuestionsDirty(true);
    setQuestionsDraft((prev) => {
      const arr = [...prev];
      const temp = arr[qIdx];
      arr[qIdx] = arr[target];
      arr[target] = temp;
      return arr;
    });
  };

  const handleSaveQuestions = async () => {
    if (!quiz) return;
    setSavingQuestions(true);
    try {
      const res = await fetch(`/api/admin/quiz/${quiz.slug}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: questionsDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "تعذر حفظ الأسئلة.");
        return;
      }
      setQuestionsDirty(false);
      await loadQuizDetails(quiz.slug, false);
      await loadQuizzesList();
      showToast("تم حفظ الأسئلة في قاعدة البيانات وإعادة احتساب الدرجات!");
    } finally {
      setSavingQuestions(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/admin/quiz/${quiz.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput,
          description: descInput,
          durationMinutes: Number(durationInput),
          maxParticipants: Number(maxStudentsInput),
          isActive: isActiveInput,
          instructorPin: newPinInput,
        }),
      });
      if (res.ok) {
        await loadQuizDetails(quiz.slug, questionsDirty);
        await loadQuizzesList();
        showToast("تم حفظ إعدادات الكويز بنجاح!");
      }
    } finally {
      setSavingSettings(false);
    }
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
      </div>
    );
  }

  // ============================================================================
  // INSTRUCTOR PIN GATE
  // ============================================================================
  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold text-slate-900">
            لوحة تحكم المعلم
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            أدخل رمز المعلم لإدارة الأسئلة، مشاركة الرابط، وإعلان لوحة الصدارة.
          </p>

          {usingDefaultPin && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-center text-xs text-teal-900">
              رمز الدخول المبدئي للتشغيل الأول هو:{" "}
              <strong className="font-mono-num text-sm">2026</strong>
              <br />
              <span className="text-teal-700">
                (يمكنك تغييره من تبويب الإعدادات فور الدخول قبل إرسال الرابط
                للطلاب)
              </span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-800">
                رمز المعلم السري
              </label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="أدخل الرمز السري..."
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono-num text-center text-lg focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            {pinError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-center text-sm font-medium text-rose-800">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800 cursor-pointer"
            >
              دخول لوحة التحكم
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeStudentsCount = participants.filter(
    (p) => p.status === "in_progress"
  ).length;
  const finishedStudentsCount = participants.filter(
    (p) => p.status !== "in_progress"
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 z-50 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg border border-slate-700">
          {toastMsg}
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white"
            >
              م
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                لوحة تحكم المعلم — إدارة الكويزات
              </h1>
              <p className="text-xs text-slate-500">
                تعديل الأسئلة • مشاركة الرابط • التحكم في نشر لوحة الصدارة (1–5)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quiz Switcher */}
            <select
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {quizzesList.map((qItem) => (
                <option key={qItem.id} value={qItem.slug}>
                  {qItem.title} ({qItem.participantsCount ?? 0}/
                  {qItem.maxParticipants})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCreateNewQuiz}
              disabled={creatingQuiz}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{creatingQuiz ? "جاري الإنشاء..." : "كويز جديد"}</span>
            </button>

            <Link
              href="/prd"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>وثيقة PRD</span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-6xl space-y-6 px-4 sm:px-6">
        {/* Share Link + Master Result Visibility Gate */}
        {quiz && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Share Box */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  رابط مشاركة الاختبار مع الطلاب ({quiz.maxParticipants} طلاب •{" "}
                  {quiz.durationMinutes} دقائق)
                </span>
                <Link
                  href={`/q/${quiz.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                >
                  <span>فتح شاشة الطالب</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div
                  dir="ltr"
                  className="flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono-num text-xs text-slate-700"
                >
                  {getShareUrl()}
                </div>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>{copiedLink ? "تم النسخ!" : "نسخ الرابط"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <Share2 className="h-4 w-4" />
                  <span>واتساب</span>
                </button>
              </div>

              <p className="mt-2.5 text-xs text-slate-500">
                كل طالب يدخل من هذا الرابط يحصل تلقائياً على ترتيب مختلف للأسئلة
                وترتيب مختلف لمواضع الخيارات (أ، ب، ج، د).
              </p>
            </div>

            {/* Master Publish Leaderboard Control */}
            <div
              className={`rounded-2xl border p-5 shadow-xs lg:col-span-5 ${
                quiz.resultsPublished
                  ? "border-teal-300 bg-gradient-to-br from-teal-50 to-white"
                  : "border-amber-200 bg-gradient-to-br from-amber-50/70 to-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      quiz.resultsPublished
                        ? "bg-teal-600 text-white"
                        : "bg-amber-200/80 text-amber-950"
                    }`}
                  >
                    {quiz.resultsPublished ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span>لوحة الصدارة منشورة للطلاب</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>النتائج محجوبة عن الطلاب حالياً</span>
                      </>
                    )}
                  </span>
                  <h2 className="mt-2 text-base font-bold text-slate-900">
                    {quiz.resultsPublished
                      ? "يشاهد الطلاب الآن الترتيب النهائي (1–5)"
                      : "لا يرى الطلاب درجاتهم إلا بقرارك"}
                  </h2>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!quiz.resultsPublished ? (
                  <button
                    type="button"
                    disabled={publishingToggle}
                    onClick={() => handleTogglePublish(true, true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Trophy className="h-4 w-4" />
                    <span>
                      {activeStudentsCount > 0
                        ? `إنهاء المحاولات الجارية (${activeStudentsCount}) ونشر لوحة الصدارة (1–5)`
                        : "إعلان ونشر لوحة الصدارة (1–5) للطلاب الآن"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={publishingToggle}
                    onClick={() => handleTogglePublish(false, false)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <EyeOff className="h-4 w-4" />
                    <span>إخفاء لوحة الصدارة مجدداً (وضع الانتظار)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("monitor")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition cursor-pointer ${
              activeTab === "monitor"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>
              متابعة الطلاب والليدربورد ({participants.length}/
              {quiz?.maxParticipants ?? 5})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("questions")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition cursor-pointer ${
              activeTab === "questions"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <FileEdit className="h-4 w-4" />
            <span>تعديل الأسئلة ({questionsDraft.length})</span>
            {questionsDirty && (
              <span className="h-2 w-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition cursor-pointer ${
              activeTab === "settings"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>إعدادات الكويز والمدة</span>
          </button>
        </div>

        {/* ================================================================
            TAB 1: LIVE STUDENT MONITOR & LEADERBOARD PREVIEW
           ================================================================ */}
        {activeTab === "monitor" && quiz && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    متابعة الطلاب المشاركين لحظياً ({participants.length} من{" "}
                    {quiz.maxParticipants})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    أنهى الحل: {finishedStudentsCount} • جاري الحل الآن:{" "}
                    {activeStudentsCount} (تحديث تلقائي كل 5 ثوانٍ)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadQuizDetails(quiz.slug, questionsDirty)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>تحديث</span>
                  </button>

                  {participants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmResetOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>تصفير المحاولات</span>
                    </button>
                  )}
                </div>
              </div>

              {participants.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    لم يدخل أي طالب حتى الآن
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    انسخ رابط الاختبار من الأعلى وشاركه مع الطلاب الخمسة لبدء
                    المنافسة.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-500">
                        <th className="py-3 px-3">اسم الطالب</th>
                        <th className="py-3 px-3">رمز الطالب</th>
                        <th className="py-3 px-3">الحالة</th>
                        <th className="py-3 px-3">التقدم</th>
                        <th className="py-3 px-3">الدرجة (سري للمعلم)</th>
                        <th className="py-3 px-3">الزمن</th>
                        <th className="py-3 px-3">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {participants.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-3 font-bold text-slate-900">
                            {p.studentName}
                          </td>
                          <td className="py-3.5 px-3 font-mono-num text-xs text-slate-500">
                            {p.accessCode}
                          </td>
                          <td className="py-3.5 px-3">
                            {p.status === "in_progress" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                                <Clock className="h-3 w-3" />
                                قيد الحل ({formatDurationArabic(p.remainingSeconds)})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                                <CheckCircle2 className="h-3 w-3" />
                                {p.status === "expired"
                                  ? "انتهى الوقت"
                                  : "تم التسليم"}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-mono-num text-xs font-semibold text-slate-700">
                            {p.answeredCount} / {p.totalQuestions}
                          </td>
                          <td className="py-3.5 px-3 font-mono-num font-bold text-teal-700">
                            {p.score} / {p.totalQuestions}
                          </td>
                          <td className="py-3.5 px-3 font-mono-num text-xs text-slate-600">
                            {p.status === "in_progress"
                              ? "جاري..."
                              : formatDurationArabic(p.timeTakenSeconds)}
                          </td>
                          <td className="py-3.5 px-3">
                            <button
                              type="button"
                              onClick={() => handleDeleteParticipant(p.id)}
                              title="حذف محاولة الطالب"
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Live Leaderboard Preview for Instructor */}
            <LeaderboardCard
              entries={leaderboardPreview}
              maxParticipants={quiz.maxParticipants}
              quizTitle={quiz.title}
              isInstructorPreview={!quiz.resultsPublished}
            />
          </div>
        )}

        {/* ================================================================
            TAB 2: QUESTION EDITOR (CRUD + REORDER + CORRECT ANSWER)
           ================================================================ */}
        {activeTab === "questions" && (
          <div className="space-y-5">
            <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-md">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  بنك أسئلة الاختبار ({questionsDraft.length} أسئلة)
                </h3>
                <p className="text-xs text-slate-500">
                  عدّل نص أي سؤال أو خياراته أو حدد الإجابة الصحيحة، ثم اضغط حفظ
                  لتحديث قاعدة البيانات.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={addNewQuestion}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>إضافة سؤال</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveQuestions}
                  disabled={savingQuestions}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {savingQuestions
                      ? "جاري الحفظ..."
                      : "حفظ التعديلات في قاعدة البيانات"}
                  </span>
                </button>
              </div>
            </div>

            {questionsDraft.map((qItem, qIdx) => (
              <div
                key={qItem.id || `new_${qIdx}`}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                    السؤال #{qIdx + 1}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, -1)}
                      disabled={qIdx === 0}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                      title="تحريك لأعلى"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, 1)}
                      disabled={qIdx === questionsDraft.length - 1}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                      title="تحريك لأسفل"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 cursor-pointer"
                      title="حذف السؤال"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-bold text-slate-700">
                    نص السؤال
                  </label>
                  <textarea
                    rows={3}
                    value={qItem.questionText}
                    onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                    placeholder="اكتب نص السؤال هنا..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-3.5 text-sm leading-relaxed text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-700">
                    الخيارات الأربعة (انقر على الدائرة بجانب الخيار الصحيح — علماً
                    بأن ترتيبها سيتبدل عشوائياً لكل طالب):
                  </p>

                  {qItem.options.map((optVal, optIdx) => {
                    const isCorrect = qItem.correctOptionIndex === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                          isCorrect
                            ? "border-emerald-400 bg-emerald-50/50"
                            : "border-slate-200 bg-slate-50/40"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => updateCorrectOption(qIdx, optIdx)}
                          className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition cursor-pointer ${
                            isCorrect
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                          }`}
                          title="تحديد كإجابة صحيحة"
                        >
                          {ARABIC_LABELS[optIdx]}
                        </button>

                        <div className="flex-1">
                          <textarea
                            rows={2}
                            value={optVal}
                            onChange={(e) =>
                              updateQuestionOption(qIdx, optIdx, e.target.value)
                            }
                            placeholder={`نص الخيار (${ARABIC_LABELS[optIdx]})`}
                            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm leading-relaxed text-slate-900 focus:border-teal-600 focus:outline-none"
                          />
                          {isCorrect && (
                            <span className="mt-1 inline-block text-xs font-bold text-emerald-700">
                              ✓ هذه هي الإجابة الصحيحة المعتمدة في التصحيح
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================================================================
            TAB 3: QUIZ SETTINGS
           ================================================================ */}
        {activeTab === "settings" && quiz && (
          <form
            onSubmit={handleSaveSettings}
            className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 space-y-5"
          >
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              إعدادات الاختبار والحماية
            </h3>

            <div>
              <label className="block text-sm font-bold text-slate-800">
                عنوان الاختبار
              </label>
              <input
                type="text"
                required
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800">
                وصف مختصر يظهر للطلاب قبل البدء
              </label>
              <textarea
                rows={3}
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-bold text-slate-800">
                  مدة الاختبار (بالدقائق)
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  required
                  value={durationInput}
                  onChange={(e) => setDurationInput(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono-num text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800">
                  الحد الأقصى للطلاب (لوحة الصدارة 1–N)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={maxStudentsInput}
                  onChange={(e) => setMaxStudentsInput(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono-num text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-bold text-slate-800">
                  رمز المعلم السري (لدخول الداشبورد)
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono-num text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  غيّر الرمز قبل مشاركة الرابط مع الطلاب لضمان خصوصية الداشبورد.
                </p>
              </div>

              <div className="flex flex-col justify-center">
                <label className="inline-flex items-center gap-3 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={isActiveInput}
                    onChange={(e) => setIsActiveInput(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                  />
                  <span className="text-sm font-bold text-slate-800">
                    السماح بدخول طلاب جدد للاختبار
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Confirm Reset All Modal */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              تأكيد تصفير جميع محاولات الطلاب
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              سيؤدي هذا الإجراء إلى حذف محاولات الطلاب الحالية في هذا الكويز،
              إعادة فتح المقاعد الخمسة بالكامل، وإخفاء لوحة الصدارة استعداداً
              لدفعة جديدة. (لن تتأثر الأسئلة).
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleResetAllParticipants}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white hover:bg-rose-700 cursor-pointer"
              >
                نعم، تصفير المحاولات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
