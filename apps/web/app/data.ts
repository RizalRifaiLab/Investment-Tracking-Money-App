"use client";

import { useCallback, useEffect, useState } from "react";
import { FALLBACK_USD_IDR, type AccountValue, type HoldingValue } from "@nilai/core";
import { supabase } from "@/lib/supabase";

export type Goal = { id: string; name: string; target_idr: number; is_active: boolean };
export type Salary = { amount: number; payday: number; invest_pct: number; auto: boolean; account_id: string | null };
export type Data = { holdings: HoldingValue[]; accounts: AccountValue[]; goals: Goal[]; salary: Salary | null; usdIdr: number };

async function fetchAll(): Promise<Data | string> {
  const [h, a, g, s, fx] = await Promise.all([
    supabase.from("holding_values").select("*").order("created_at"),
    supabase.from("account_values").select("*").order("created_at"),
    supabase.from("goals").select("id,name,target_idr,is_active").order("created_at"),
    supabase.from("salary_settings").select("amount,payday,invest_pct,auto,account_id").maybeSingle(),
    supabase.from("fx_rates").select("rate").eq("pair", "USDIDR").maybeSingle(),
  ]);
  const err = h.error ?? a.error ?? g.error ?? s.error ?? fx.error;
  if (err) return err.message;
  return { holdings: h.data ?? [], accounts: a.data ?? [], goals: g.data ?? [], salary: s.data, usdIdr: Number(fx.data?.rate) || FALLBACK_USD_IDR };
}

export function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => fetchAll().then((r) => {
    if (typeof r === "string") return setError(r);
    setError("");
    setData(r);
  }), []);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}
