-- Cash flow: transactions move their account's balance (atomically, in the DB), and salaries auto-post on payday.

-- Manual and salary transactions adjust the balance; imported rows don't (the import can set the closing balance instead).
create function apply_txn_to_balance() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.source <> 'import' then
    update public.accounts set balance = balance - old.amount where id = old.account_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.source <> 'import' then
    update public.accounts set balance = balance + new.amount where id = new.account_id;
  end if;
  return null;
end $$;
create trigger txn_balance after insert or update or delete on transactions for each row execute function apply_txn_to_balance();

-- At most one auto/logged salary per user per month.
create unique index transactions_one_salary_per_month on transactions (user_id, (date_trunc('month', date::timestamp))) where source = 'salary';

-- Daily job: on/after payday (clamped to the month's last day), post the salary unless a Salary transaction exists this month.
create function post_due_salaries() returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  last_day int := extract(day from (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int;
  n int;
begin
  insert into public.transactions (user_id, account_id, date, description, amount, category, source)
  select s.user_id, s.account_id, today, 'Salary', s.amount, 'Salary', 'salary'
  from public.salary_settings s
  where s.auto and s.amount > 0 and s.account_id is not null
    and extract(day from today) >= least(s.payday, last_day)
    and not exists (
      select 1 from public.transactions t
      where t.user_id = s.user_id and t.category = 'Salary' and date_trunc('month', t.date::timestamp) = date_trunc('month', today::timestamp))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function post_due_salaries from public, anon, authenticated;

-- 00:05 WIB = 17:05 UTC
select cron.schedule('post-salaries', '5 17 * * *', $$ select public.post_due_salaries(); $$);
