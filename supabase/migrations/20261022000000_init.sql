-- Nilai phase 1 schema. Money/qty/price/rate are NUMERIC; values stay in their original currency
-- and are converted to IDR on read (see holding_values / account_values).

create extension if not exists pgcrypto with schema extensions;

create type asset_class as enum ('Crypto', 'IDX stocks', 'US stocks', 'ETF', 'Deposito', 'Reksa dana', 'Gold');
create type txn_category as enum ('Salary', 'Income', 'Food', 'Transport', 'Bills', 'Shopping', 'Transfer', 'Investment', 'Other');
create type risk_profile as enum ('Conservative', 'Balanced', 'Aggressive');

-- ---------- per-user tables ----------
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  currency text not null default 'IDR' check (currency in ('IDR', 'USD')),
  language text not null default 'en' check (language in ('en', 'id')),
  risk_profile risk_profile not null default 'Balanced',
  created_at timestamptz not null default now()
);

-- Kept apart from profiles so no RLS policy can ever expose the hash; only the functions below touch it.
create table pins (
  user_id uuid primary key references auth.users on delete cascade,
  pin_hash text not null,
  failed int not null default 0
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  bank text not null,
  label text not null default '',
  currency text not null default 'IDR' check (currency in ('IDR', 'USD')),
  balance numeric(19, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  class asset_class not null,
  name text not null,
  ticker text not null default '',
  quantity numeric(28, 10) not null check (quantity > 0),
  manual_price numeric(28, 10) not null check (manual_price > 0),
  price_currency text not null default 'IDR' check (price_currency in ('IDR', 'USD')),
  provider text check (provider in ('coingecko', 'finnhub')),
  provider_symbol text,
  tv_symbol text,
  deposit_rate numeric(6, 3),
  maturity_date date,
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  target_idr numeric(19, 2) not null check (target_idr > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index goals_one_active on goals (user_id) where is_active;

create table salary_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  amount numeric(19, 2) not null default 0 check (amount >= 0),
  payday int not null default 25 check (payday between 1 and 31),
  invest_pct numeric(5, 2) not null default 0 check (invest_pct between 0 and 100),
  auto boolean not null default true,
  account_id uuid references accounts on delete set null
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references accounts on delete cascade,
  file_path text,
  status text not null default 'pending',
  closing_balance numeric(19, 2),
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references accounts on delete restrict,
  date date not null,
  description text not null,
  amount numeric(19, 2) not null, -- signed, in the account's currency
  category txn_category not null default 'Other',
  source text not null default 'manual' check (source in ('manual', 'import', 'salary')),
  import_id uuid references imports on delete set null,
  created_at timestamptz not null default now()
);
create index transactions_user_date on transactions (user_id, date desc);

create table networth_snapshots (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  total_idr numeric(19, 2) not null,
  primary key (user_id, date)
);

create table briefs (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  language text not null,
  profile risk_profile not null,
  items jsonb not null,
  primary key (user_id, date, language, profile)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- shared market data (written by the price job with the service role) ----------
create table prices (
  provider text not null,
  provider_symbol text not null,
  price numeric(28, 10) not null,
  currency text not null,
  change_24h numeric(9, 4),
  updated_at timestamptz not null default now(),
  primary key (provider, provider_symbol)
);

create table fx_rates (
  pair text primary key,
  rate numeric(19, 6) not null,
  updated_at timestamptz not null default now()
);
insert into fx_rates (pair, rate) values ('USDIDR', 16250);

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table pins enable row level security; -- no policies: unreachable from the client
alter table accounts enable row level security;
alter table holdings enable row level security;
alter table goals enable row level security;
alter table salary_settings enable row level security;
alter table imports enable row level security;
alter table transactions enable row level security;
alter table networth_snapshots enable row level security;
alter table briefs enable row level security;
alter table chat_messages enable row level security;
alter table prices enable row level security;
alter table fx_rates enable row level security;

create policy own on profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on accounts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on holdings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on goals for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on salary_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on imports for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on transactions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- snapshots and briefs are written by jobs; users only read them
create policy own_read on networth_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on briefs for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on chat_messages for select to authenticated using (user_id = (select auth.uid()));
create policy read_all on prices for select to authenticated using (true);
create policy read_all on fx_rates for select to authenticated using (true);

-- an account's salary/transactions must belong to the same user
create function check_account_owner() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'account not found';
  end if;
  return new;
end $$;
create trigger salary_account_owner before insert or update on salary_settings for each row execute function check_account_owner();
create trigger txn_account_owner before insert or update on transactions for each row execute function check_account_owner();
create trigger import_account_owner before insert or update on imports for each row execute function check_account_owner();

-- ---------- new user: profile + empty salary row ----------
create function handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  insert into public.salary_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- PIN (bcrypt via pgcrypto; app unlock, not the account password) ----------
create function has_pin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pins where user_id = auth.uid());
$$;

-- Set the first PIN, or reset a forgotten one right after an email OTP sign-in (amr = otp within 10 min).
create function set_pin(new_pin text) returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fresh_otp boolean := exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
    where m ->> 'method' in ('otp', 'oauth') and to_timestamp((m ->> 'timestamp')::bigint) > now() - interval '10 minutes');
begin
  if uid is null then raise exception 'not signed in'; end if;
  if new_pin !~ '^\d{6}$' then raise exception 'PIN must be 6 digits'; end if;
  if exists (select 1 from public.pins where user_id = uid) and not fresh_otp then raise exception 'verify your email first'; end if;
  insert into public.pins (user_id, pin_hash) values (uid, extensions.crypt(new_pin, extensions.gen_salt('bf')))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0;
end $$;

-- Returns tries left (5 = success). At 0 every session of the user is revoked, so the client must OTP again.
create function verify_pin(pin text) returns int language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.pins;
begin
  select * into p from public.pins where user_id = uid for update;
  if p is null then raise exception 'no PIN set'; end if;
  if p.pin_hash = extensions.crypt(pin, p.pin_hash) then
    update public.pins set failed = 0 where user_id = uid;
    return 5;
  end if;
  if p.failed + 1 >= 5 then
    update public.pins set failed = 0 where user_id = uid;
    delete from auth.sessions where user_id = uid;
    return 0;
  end if;
  update public.pins set failed = p.failed + 1 where user_id = uid;
  return 5 - (p.failed + 1);
end $$;

create function change_pin(current_pin text, new_pin text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if new_pin !~ '^\d{6}$' then raise exception 'PIN must be 6 digits'; end if;
  if public.verify_pin(current_pin) <> 5 then raise exception 'wrong PIN'; end if;
  update public.pins set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf')) where user_id = auth.uid();
end $$;

revoke execute on function has_pin, set_pin, verify_pin, change_pin from public, anon;
grant execute on function has_pin, set_pin, verify_pin, change_pin to authenticated;

-- ---------- valuation: live price from the prices table when present, else the manual price ----------
create view holding_values with (security_invoker = true) as
select h.*,
  coalesce(p.price, h.manual_price) as price,
  coalesce(p.change_24h, 0) as change_24h,
  p.updated_at as price_updated_at,
  (p.price is not null) as is_live,
  coalesce(p.currency, h.price_currency) as value_currency,
  h.quantity * coalesce(p.price, h.manual_price) * case when coalesce(p.currency, h.price_currency) = 'USD' then fx.rate else 1 end as value_idr
from holdings h
left join prices p on p.provider = h.provider and p.provider_symbol = h.provider_symbol
cross join (select rate from fx_rates where pair = 'USDIDR') fx;

create view account_values with (security_invoker = true) as
select a.*, a.balance * case when a.currency = 'USD' then fx.rate else 1 end as value_idr
from accounts a
cross join (select rate from fx_rates where pair = 'USDIDR') fx;
