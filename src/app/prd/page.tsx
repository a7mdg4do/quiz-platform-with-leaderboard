import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Database,
  Shield,
  Shuffle,
  Clock,
  Trophy,
  CloudUpload,
  ArrowRight,
  Sliders,
} from "lucide-react";

export default function PrdPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-teal-700"
          >
            <ArrowRight className="h-4 w-4" />
            <span>العودة للصفحة الرئيسية</span>
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            فتح لوحة تحكم المعلم
          </Link>
        </div>

        {/* Hero */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10">
          <span className="inline-block rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800">
            Product Requirements Document (PRD)
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 sm:text-3xl">
            وثيقة متطلبات المنتج والهندسة المعمارية — منصة «مِقياس»
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            توثق هذه الصفحة المتطلبات الكاملة وتصميم قاعدة البيانات وآلية حماية
            النتائج والرفع السحابي على Vercel وفق المواصفات المطلوبة.
          </p>

          {/* Feature Pillars */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center gap-2.5 font-bold text-slate-900">
                <Shuffle className="h-5 w-5 text-teal-600" />
                <span>عشوائية كاملة للأسئلة والخيارات لكل طالب</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                عند دخول أي طالب من الطلاب الخمسة، يولّد الخادم عبر خوارزمية
                Fisher-Yates ترتيباً مستقلاً للأسئلة العشرة وترتيباً مستقلاً
                لمواضع الخيارات (أ، ب، ج، د) ويحفظهما في PostgreSQL لضمان ثبات
                العرض عند تحديث الصفحة ومنع الغش البصري.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center gap-2.5 font-bold text-slate-900">
                <Clock className="h-5 w-5 text-teal-600" />
                <span>مؤقت 10 دقائق محكوم من الخادم + حفظ تلقائي</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                يُحسب وقت البدء والانتهاء (10 دقائق) في قاعدة البيانات، وتُحفظ كل
                إجابة لحظياً عند اختيارها؛ فإذا انتهى الوقت أو انقطع اتصال الطالب
                تُعتمد إجاباته تلقائياً دون ضياع أي سؤال.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center gap-2.5 font-bold text-slate-900">
                <Shield className="h-5 w-5 text-teal-600" />
                <span>حجب تام للنتيجة بعد الحل حتى قرار المعلم</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                لا تُرسل الإجابات الصحيحة ولا درجة الطالب إلى المتصفح إطلاقاً بعد
                التسليم. ينتقل الطالب لشاشة انتظار أنيقة، ولا يظهر الترتيب أو
                الدرجات إلا في لوحة الصدارة (1–5) عندما يضغط المعلم «نشر لوحة
                الصدارة».
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center gap-2.5 font-bold text-slate-900">
                <Trophy className="h-5 w-5 text-teal-600" />
                <span>لوحة صدارة (1–5) وعودة الطالب لاحقاً</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                يُرتب الطلاب الخمسة من المركز 1 إلى 5 حسب الدرجة الأعلى ثم الزمن
                الأسرع. وعند دخول الطالب مرة أخرى من نفس جهازه (تلقائياً) أو من
                أي جهاز آخر (بالاسم والرمز الشخصي)، يشاهد نتيجته وترتيبه فوراً.
              </p>
            </div>
          </div>

          {/* Database Architecture */}
          <div className="mt-8 border-t border-slate-100 pt-7">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Database className="h-5 w-5 text-teal-600" />
              <h2>معمارية قاعدة البيانات (PostgreSQL + Drizzle ORM)</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>جدول quizzes:</strong> يحفظ بيانات الكويز، الرابط
                  الفريد، المدة (10 دقائق)، عدد الطلاب (5)، حالة فتح التسجيل،
                  ومفتاح نشر النتائج <code>results_published</code>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>جدول questions:</strong> يحفظ الأسئلة العشرة وخياراتها
                  الأربعة ومؤشر الإجابة الصحيحة القابل للتعديل من لوحة التحكم.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-1" />
                <span>
                  <strong>جدول participants:</strong> يحفظ اسم الطالب، رمز جلسته،
                  ترتيب أسئلته وخياراته المخصص، إجاباته المحفوظة، درجته، وزمن
                  الحل بالثواني.
                </span>
              </li>
            </ul>
          </div>

          {/* Dashboard Capabilities */}
          <div className="mt-8 border-t border-slate-100 pt-7">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Sliders className="h-5 w-5 text-teal-600" />
              <h2>صلاحيات لوحة تحكم المعلم (/dashboard)</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              تمكنك لوحة التحكم من تعديل نصوص الأسئلة والخيارات وتحديد الإجابة
              الصحيحة، إنشاء كويزات جديدة، نسخ رابط المشاركة أو إرساله عبر
              واتساب، متابعة تقدم الطلاب الخمسة لحظياً، وتفعيل أو إخفاء لوحة
              الصدارة بضغطة زر واحدة.
            </p>
          </div>

          {/* Vercel Deployment Steps */}
          <div className="mt-8 rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white">
            <div className="flex items-center gap-2.5 text-lg font-bold">
              <CloudUpload className="h-5 w-5 text-teal-400" />
              <h2>خطوات الرفع المباشر على Vercel</h2>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-slate-300 list-decimal list-inside leading-relaxed">
              <li>
                ارفع الكود إلى مستودع GitHub واربطه بمشروع جديد على{" "}
                <strong className="text-white">Vercel</strong>.
              </li>
              <li>
                أنشئ قاعدة بيانات PostgreSQL سحابية (عبر{" "}
                <strong className="text-white">Neon</strong> أو{" "}
                <strong className="text-white">Vercel Postgres</strong> أو{" "}
                <strong className="text-white">Supabase</strong>) وأضف الرابط في
                متغير البيئة{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-teal-300">
                  DATABASE_URL
                </code>{" "}
                داخل إعدادات Vercel.
              </li>
              <li>
                نفذ أمر دفع الجداول مرة واحدة نحو قاعدة البيانات السحابية:{" "}
                <code
                  dir="ltr"
                  className="rounded bg-white/10 px-2 py-0.5 font-mono-num text-teal-300"
                >
                  npx drizzle-kit push
                </code>
              </li>
              <li>
                بمجرد فتح الموقع بعد الرفع، يقوم النظام تلقائياً بزرع (Auto-Seed)
                الأسئلة العشرة الكاملة وإعداد الاختبار فوراً دون أي تدخل إضافي.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
