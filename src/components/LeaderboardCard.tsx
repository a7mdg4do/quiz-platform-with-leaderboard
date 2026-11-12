"use client";

import React from "react";
import { Trophy, Medal, Clock, CheckCircle2, Award, User } from "lucide-react";

export interface LeaderboardRow {
  rank: number;
  participantId: string;
  studentName: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number | null;
  status: string;
  answeredCount: number;
}

export function formatDurationArabic(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface LeaderboardCardProps {
  entries: LeaderboardRow[];
  maxParticipants?: number;
  highlightParticipantId?: string | null;
  quizTitle?: string;
  isInstructorPreview?: boolean;
}

export default function LeaderboardCard({
  entries,
  maxParticipants = 5,
  highlightParticipantId,
  quizTitle,
  isInstructorPreview = false,
}: LeaderboardCardProps) {
  const slotsCount = Math.max(maxParticipants, entries.length);
  const slots = Array.from({ length: slotsCount }, (_, idx) => {
    const rank = idx + 1;
    const found = entries.find((e) => e.rank === rank) ?? null;
    return { rank, entry: found };
  });

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) {
      return "bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-200/70";
    }
    if (rank === 2) {
      return "bg-slate-200 text-slate-800 border-slate-300";
    }
    if (rank === 3) {
      return "bg-orange-100 text-orange-800 border-orange-300";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-teal-900 px-6 py-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/20 border border-amber-300/30 text-amber-300">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">
                  لوحة الصدارة والترتيب النهائي (1 – {slotsCount})
                </h2>
                {isInstructorPreview && (
                  <span className="rounded-full bg-teal-500/20 border border-teal-400/30 px-2.5 py-0.5 text-xs font-medium text-teal-200">
                    معاينة المعلم
                  </span>
                )}
              </div>
              {quizTitle && (
                <p className="mt-1 text-sm text-slate-300">{quizTitle}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white/10 px-4 py-2 text-xs text-slate-200 backdrop-blur-sm border border-white/10">
            يُحسم الترتيب بالدرجة الأعلى ثم الزمن الأسرع
          </div>
        </div>
      </div>

      {/* Top 3 Podium Cards when at least 1 student exists */}
      {entries.length > 0 && (
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-3">
          {[1, 2, 3].map((podiumRank) => {
            const item = entries.find((e) => e.rank === podiumRank);
            const isMe =
              item && highlightParticipantId === item.participantId;
            return (
              <div
                key={podiumRank}
                className={`relative rounded-xl border p-4 transition-all ${
                  podiumRank === 1
                    ? "border-amber-300 bg-gradient-to-b from-amber-50/90 to-white shadow-sm"
                    : podiumRank === 2
                    ? "border-slate-300 bg-white"
                    : "border-orange-200 bg-white"
                } ${isMe ? "ring-2 ring-teal-600" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${getRankBadgeStyle(
                      podiumRank
                    )}`}
                  >
                    {podiumRank === 1 ? (
                      <Trophy className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Medal className="h-3.5 w-3.5" />
                    )}
                    المركز #{podiumRank}
                  </span>
                  {isMe && (
                    <span className="rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      أنت
                    </span>
                  )}
                </div>

                {item ? (
                  <div className="mt-3">
                    <p className="truncate text-base font-bold text-slate-900">
                      {item.studentName}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-mono-num font-bold text-teal-700">
                        {item.score} / {item.totalQuestions}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-mono-num">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDurationArabic(item.timeTakenSeconds)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 py-2 text-sm text-slate-400">
                    بانتظار مشارك...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ranked Table 1..5 */}
      <div className="divide-y divide-slate-100">
        {slots.map(({ rank, entry }) => {
          const isMe =
            entry && highlightParticipantId === entry.participantId;

          return (
            <div
              key={rank}
              className={`flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors ${
                isMe
                  ? "bg-teal-50/80"
                  : entry
                  ? "hover:bg-slate-50/80"
                  : "bg-slate-50/30"
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono-num text-sm font-bold ${getRankBadgeStyle(
                    rank
                  )}`}
                >
                  #{rank}
                </div>

                {entry ? (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-base truncate">
                        {entry.studentName}
                      </span>
                      {isMe && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                          نتيجتك
                        </span>
                      )}
                      {entry.status === "in_progress" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          قيد الحل الآن
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
                        أجاب على {entry.answeredCount} من {entry.totalQuestions}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-num">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        الزمن: {formatDurationArabic(entry.timeTakenSeconds)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <User className="h-4 w-4" />
                    <span>مقعد شاغر (الطالب رقم {rank})</span>
                  </div>
                )}
              </div>

              {entry ? (
                <div className="flex items-center gap-4">
                  <div className="text-left">
                    <div className="flex items-baseline gap-1 justify-end">
                      <span className="font-mono-num text-xl font-bold text-slate-900">
                        {entry.score}
                      </span>
                      <span className="font-mono-num text-sm text-slate-500">
                        / {entry.totalQuestions}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-teal-700 font-mono-num">
                      {entry.percentage}%
                    </div>
                  </div>

                  {rank === 1 && (
                    <Award className="h-6 w-6 text-amber-500 shrink-0" />
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-400 font-mono-num">-- / 10</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
