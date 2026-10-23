import { createClient } from "@supabase/supabase-js";
import { admin } from "@/lib/prices";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST {email} → {status: 'has_pin' | 'none'}: does this email sign in with a PIN?
// POST {email, pin} → {status: 'ok', session} | 'wrong' (+left) | 'locked' | 'none'.
// The PIN is checked (and locked after 5 tries) in Postgres; on success we mint a session via a one-time
// sign-in code that is never emailed.
export async function POST(req: Request) {
  const { email, pin } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !EMAIL.test(email.trim())) return Response.json({ error: "bad email" }, { status: 400 });
  if (pin != null && !/^\d{6}$/.test(String(pin))) return Response.json({ error: "bad pin" }, { status: 400 });

  const db = admin();
  const { data, error } = await db.rpc("pin_login", { p_email: email, p_pin: pin ?? null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (data.status !== "ok") return Response.json(data);

  const link = await db.auth.admin.generateLink({ type: "magiclink", email: email.trim() });
  if (link.error) return Response.json({ error: link.error.message }, { status: 500 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const v = await anon.auth.verifyOtp({ email: email.trim(), token: link.data.properties.email_otp, type: "email" });
  if (v.error || !v.data.session) return Response.json({ error: v.error?.message ?? "no session" }, { status: 500 });
  const { access_token, refresh_token } = v.data.session;
  return Response.json({ status: "ok", session: { access_token, refresh_token } });
}
