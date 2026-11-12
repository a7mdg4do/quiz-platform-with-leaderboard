import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded, isAuthorizedInstructor } from "@/lib/quiz-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const pin =
    req.headers.get("x-admin-pin")?.trim() ||
    req.cookies.get("quiz_admin_pin")?.value?.trim();

  const authorized = await isAuthorizedInstructor(pin);
  const usingDefaultPin = await isAuthorizedInstructor("2026");
  return NextResponse.json({ authorized, usingDefaultPin });
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    const authorized = await isAuthorizedInstructor(pin);
    if (!authorized) {
      return NextResponse.json(
        { error: "رمز المعلم غير صحيح." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true, authorized: true });
    res.cookies.set("quiz_admin_pin", pin, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "تعذر التحقق من رمز المعلم." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("quiz_admin_pin");
  return res;
}
