import { supabase } from "./supabase";

/** fetch() to our own API routes with the user's Supabase token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}
