-- Statement import: re-importing a month replaces that month's imported rows for the account; other months are kept.
-- Manual and salary transactions are never touched by an import.

-- rows: [{date: 'YYYY-MM-DD', description, amount (signed, account currency), category}]
create function commit_import(p_account uuid, p_rows jsonb, p_closing numeric default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  months date[];
  imp uuid;
  replaced int;
  inserted int;
begin
  if not exists (select 1 from public.accounts where id = p_account and user_id = uid) then
    raise exception 'account not found';
  end if;
  select array_agg(distinct date_trunc('month', (r ->> 'date')::date)::date) into months from jsonb_array_elements(p_rows) r;
  if months is null then raise exception 'no rows'; end if;

  delete from public.transactions
  where account_id = p_account and source = 'import' and date_trunc('month', date)::date = any (months);
  get diagnostics replaced = row_count;
  delete from public.cashflow_insights where user_id = uid and month = any (months); -- stale now

  insert into public.imports (account_id, status, closing_balance) values (p_account, 'done', p_closing) returning id into imp;
  insert into public.transactions (account_id, date, description, amount, category, source, import_id)
  select p_account, (r ->> 'date')::date, left(coalesce(r ->> 'description', ''), 200), (r ->> 'amount')::numeric,
         case when r ->> 'category' in (select unnest(enum_range(null::public.txn_category))::text)
              then (r ->> 'category')::public.txn_category else 'Other' end,
         'import', imp
  from jsonb_array_elements(p_rows) r;
  get diagnostics inserted = row_count;

  if p_closing is not null then
    update public.accounts set balance = p_closing where id = p_account;
  end if;
  return jsonb_build_object('inserted', inserted, 'replaced', replaced, 'months', to_jsonb(months));
end $$;
revoke execute on function commit_import from public, anon;
grant execute on function commit_import to authenticated;

-- AI analysis of one month's cash flow, cached until regenerated or the month is re-imported.
create table cashflow_insights (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month date not null, -- first day of the month
  language text not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month, language)
);
alter table cashflow_insights enable row level security;
create policy own on cashflow_insights for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
