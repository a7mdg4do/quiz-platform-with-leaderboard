/**
 * Quiz scheduling helpers. Pure functions (no DB / server imports) so they can
 * be shared by API routes and client components.
 *
 * Timeline for a quiz with `startsAt = 22:00`:
 *   before 21:50          -> "not_open"      (registration closed, "quiz not started yet" page)
 *   21:50 <= t < 22:00    -> "registration"  (students may register, then wait for the start)
 *   t >= 22:00            -> "started"       (quiz is live)
 * A quiz without `startsAt` is always "none" (no restriction).
 */

export const REGISTRATION_LEAD_MINUTES = 10;

export type ScheduleState = "none" | "not_open" | "registration" | "started";

export interface ScheduleInfo {
  state: ScheduleState;
  startsAt: Date | null;
  registrationOpensAt: Date | null;
}

export function getScheduleInfo(
  startsAt: Date | string | null | undefined,
  now: Date = new Date()
): ScheduleInfo {
  if (!startsAt) {
    return { state: "none", startsAt: null, registrationOpensAt: null };
  }

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return { state: "none", startsAt: null, registrationOpensAt: null };
  }

  const registrationOpensAt = new Date(
    start.getTime() - REGISTRATION_LEAD_MINUTES * 60 * 1000
  );

  let state: ScheduleState;
  if (now.getTime() < registrationOpensAt.getTime()) {
    state = "not_open";
  } else if (now.getTime() < start.getTime()) {
    state = "registration";
  } else {
    state = "started";
  }

  return { state, startsAt: start, registrationOpensAt };
}

/** True while answers must not be accepted yet (quiz has not started). */
export function isBeforeStart(
  startsAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const { state } = getScheduleInfo(startsAt, now);
  return state === "not_open" || state === "registration";
}
