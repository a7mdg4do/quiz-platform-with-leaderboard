import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const quizzes = pgTable("quizzes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(10),
  maxParticipants: integer("max_participants").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  resultsPublished: boolean("results_published").notNull().default(false),
  instructorPin: text("instructor_pin").notNull().default("2026"),
  // Optional scheduled start. When set, new students can register starting
  // REGISTRATION_LEAD_MINUTES before this instant and the quiz opens at it.
  startsAt: timestamp("starts_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  questionText: text("question_text").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctOptionIndex: integer("correct_option_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  accessCode: text("access_code").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  questionOrder: jsonb("question_order").$type<string[]>().notNull(),
  optionOrders: jsonb("option_orders")
    .$type<Record<string, number[]>>()
    .notNull(),
  answers: jsonb("answers")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  status: text("status").notNull().default("in_progress"), // "in_progress" | "submitted" | "expired"
  score: integer("score").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(10),
  startedAt: timestamp("started_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  submittedAt: timestamp("submitted_at"),
  timeTakenSeconds: integer("time_taken_seconds"),
});

export type Quiz = typeof quizzes.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Participant = typeof participants.$inferSelect;
