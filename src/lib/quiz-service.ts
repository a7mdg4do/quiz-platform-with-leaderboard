import { db } from "@/db";
import {
  quizzes,
  questions,
  participants,
  type Quiz,
  type Question,
  type Participant,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  DEFAULT_QUESTIONS,
  DEFAULT_QUIZ_ID,
  DEFAULT_QUIZ_SLUG,
} from "./seed-data";
import { randomBytes } from "crypto";

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    try {
      const existing = await db.select().from(quizzes).limit(1);
      if (existing.length > 0) {
        return;
      }

      const initialPin = process.env.ADMIN_PIN?.trim() || "2026";

      await db
        .insert(quizzes)
        .values({
          id: DEFAULT_QUIZ_ID,
          slug: DEFAULT_QUIZ_SLUG,
          title: "اختبار معمارية الحاسوب والذكاء الاصطناعي التوليدي",
          description:
            "اختبار تنافسي مكثف مكوّن من 10 أسئلة اختيار من متعدد لقياس الفهم العميق لمفاهيم الحوسبة الكمومية، الحوسبة الطرفية والسحابية، الشبكات العصبية، والذكاء الاصطناعي التوليدي.",
          durationMinutes: 10,
          maxParticipants: 5,
          isActive: true,
          resultsPublished: false,
          instructorPin: initialPin,
        })
        .onConflictDoNothing();

      for (const q of DEFAULT_QUESTIONS) {
        await db
          .insert(questions)
          .values({
            id: q.id,
            quizId: DEFAULT_QUIZ_ID,
            orderIndex: q.orderIndex,
            questionText: q.questionText,
            options: [...q.options],
            correctOptionIndex: q.correctOptionIndex,
          })
          .onConflictDoNothing();
      }
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Quiz row safe to send to the browser: never exposes the instructor PIN. */
export function toAdminQuiz(quiz: Quiz): Omit<Quiz, "instructorPin"> {
  const { instructorPin, ...rest } = quiz;
  void instructorPin;
  return rest;
}

export function generateSessionToken(): string {
  return randomBytes(24).toString("hex");
}

export function shuffleArray<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

export function normalizeArabicName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .toLowerCase();
}

export function stripLeadingArabicOptionPrefix(text: string): string {
  return text.replace(/^\s*[أابجدABCDabcd]\s*[\)\-\.\:]\s*/, "").trim();
}

export function getMaxScore(quizQuestions: Question[]): number {
  return quizQuestions.reduce((sum, q) => sum + Math.max(1, q.points ?? 1), 0);
}

export function getParticipantAnsweredCount(
  participant: Pick<Participant, "answers" | "essayAnswers">,
  quizQuestions: Question[]
): number {
  let count = 0;
  for (const q of quizQuestions) {
    if (q.questionType === "essay") {
      if ((participant.essayAnswers?.[q.id] ?? "").trim().length > 0) {
        count += 1;
      }
    } else if (typeof participant.answers?.[q.id] === "number") {
      count += 1;
    }
  }
  return count;
}

export interface QuestionGradingBreakdown {
  earnedPoints: number;
  maxPoints: number;
  isGraded: boolean;
  isManuallyGraded: boolean;
}

export function getQuestionScoreBreakdown(
  q: Question,
  participant: Pick<Participant, "answers" | "manualScores">,
  gradingMode: string
): QuestionGradingBreakdown {
  const maxPoints = Math.max(1, q.points ?? 1);
  const manualVal = participant.manualScores?.[q.id];
  if (typeof manualVal === "number" && Number.isFinite(manualVal)) {
    return {
      earnedPoints: Math.max(0, Math.min(maxPoints, Math.round(manualVal))),
      maxPoints,
      isGraded: true,
      isManuallyGraded: true,
    };
  }

  if (q.questionType === "essay" || gradingMode === "manual_all") {
    return {
      earnedPoints: 0,
      maxPoints,
      isGraded: false,
      isManuallyGraded: false,
    };
  }

  const chosen = participant.answers?.[q.id];
  const isCorrect =
    typeof chosen === "number" && chosen === q.correctOptionIndex;
  return {
    earnedPoints: isCorrect ? maxPoints : 0,
    maxPoints,
    isGraded: true,
    isManuallyGraded: false,
  };
}

export function computeParticipantTotals(
  quiz: Pick<Quiz, "gradingMode">,
  participant: Pick<Participant, "answers" | "essayAnswers" | "manualScores">,
  quizQuestions: Question[]
): {
  score: number;
  maxScore: number;
  answeredCount: number;
  pendingGradingCount: number;
} {
  let score = 0;
  let maxScore = 0;
  let pendingGradingCount = 0;

  for (const q of quizQuestions) {
    const bd = getQuestionScoreBreakdown(q, participant, quiz.gradingMode);
    score += bd.earnedPoints;
    maxScore += bd.maxPoints;
    if (!bd.isGraded) {
      pendingGradingCount += 1;
    }
  }

  return {
    score,
    maxScore,
    answeredCount: getParticipantAnsweredCount(participant, quizQuestions),
    pendingGradingCount,
  };
}

export async function syncExpiredParticipants(
  quiz: Quiz,
  quizQuestions?: Question[]
): Promise<void> {
  const allParticipants = await db
    .select()
    .from(participants)
    .where(eq(participants.quizId, quiz.id));

  const now = new Date();
  const expiredOnes = allParticipants.filter(
    (p) => p.status === "in_progress" && new Date(p.expiresAt) <= now
  );

  if (expiredOnes.length === 0) return;

  const qList =
    quizQuestions ??
    (await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.orderIndex)));

  for (const p of expiredOnes) {
    const { score } = computeParticipantTotals(quiz, p, qList);
    const maxDurationSec = Math.max(
      1,
      Math.round(
        (new Date(p.expiresAt).getTime() - new Date(p.startedAt).getTime()) /
          1000
      )
    );

    await db
      .update(participants)
      .set({
        status: "expired",
        score,
        totalQuestions: qList.length,
        submittedAt: p.expiresAt,
        timeTakenSeconds: maxDurationSec,
      })
      .where(eq(participants.id, p.id));
  }
}

export async function recalculateQuizScores(quizId: string): Promise<void> {
  const quizRows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (quizRows.length === 0) return;
  const quiz = quizRows[0];

  const qList = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.orderIndex));

  const pList = await db
    .select()
    .from(participants)
    .where(eq(participants.quizId, quizId));

  const validQMap = new Map(qList.map((q) => [q.id, q]));

  for (const p of pList) {
    const clampedManual: Record<string, number> = {};
    for (const [qId, val] of Object.entries(p.manualScores ?? {})) {
      const targetQ = validQMap.get(qId);
      if (targetQ && typeof val === "number" && Number.isFinite(val)) {
        const maxPts = Math.max(1, targetQ.points ?? 1);
        clampedManual[qId] = Math.max(0, Math.min(maxPts, Math.round(val)));
      }
    }

    const { score } = computeParticipantTotals(
      quiz,
      { ...p, manualScores: clampedManual },
      qList
    );

    await db
      .update(participants)
      .set({
        manualScores: clampedManual,
        score,
        totalQuestions: qList.length,
      })
      .where(eq(participants.id, p.id));
  }
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  studentName: string;
  score: number;
  maxScore: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number | null;
  status: string;
  answeredCount: number;
  pendingGradingCount: number;
  submittedAt: string | null;
}

export function buildLeaderboard(
  pList: Participant[],
  quizQuestions: Question[],
  quiz: Pick<Quiz, "gradingMode">
): LeaderboardEntry[] {
  const sorted = [...pList].sort((a, b) => {
    // Completed/expired attempts rank by score DESC, then faster time ASC
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const aTime = a.timeTakenSeconds ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.timeTakenSeconds ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });

  const denomQuestions = quizQuestions.length;
  const maxScore = getMaxScore(quizQuestions);

  return sorted.map((p, idx) => {
    const totals = computeParticipantTotals(quiz, p, quizQuestions);
    const scoreVal = p.score ?? totals.score;
    return {
      rank: idx + 1,
      participantId: p.id,
      studentName: p.studentName,
      score: scoreVal,
      maxScore: maxScore || denomQuestions || 10,
      totalQuestions: denomQuestions || p.totalQuestions || 10,
      percentage: maxScore > 0 ? Math.round((scoreVal / maxScore) * 100) : 0,
      timeTakenSeconds: p.timeTakenSeconds,
      status: p.status,
      answeredCount: totals.answeredCount,
      pendingGradingCount: totals.pendingGradingCount,
      submittedAt: p.submittedAt ? new Date(p.submittedAt).toISOString() : null,
    };
  });
}

export async function isAuthorizedInstructor(
  providedPin: string | null | undefined,
  quiz?: Quiz | null
): Promise<boolean> {
  if (!providedPin) return false;
  const cleanPin = providedPin.trim();
  if (!cleanPin) return false;

  const envPin = process.env.ADMIN_PIN?.trim();
  if (envPin && cleanPin === envPin) return true;

  if (quiz && cleanPin === quiz.instructorPin) return true;

  const allQuizzes = await db.select().from(quizzes);
  if (allQuizzes.some((q) => q.instructorPin === cleanPin)) {
    return true;
  }

  return false;
}
