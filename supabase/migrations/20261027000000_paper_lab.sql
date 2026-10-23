-- Paper-trading lab: the advisor's AI trades fake IDR at real prices, compared with buy-and-hold.
-- Users only read; every write goes through /api/paper on the server.
create table paper_accounts (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  start_idr numeric not null check (start_idr > 0),
  cash_idr numeric not null,
  benchmark jsonb not null,           -- {symbol: units} bought on day one and never touched
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table paper_trades (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  qty numeric not null check (qty > 0),
  price numeric not null,             -- in the instrument's currency
  currency text not null check (currency in ('IDR', 'USD')),
  usd_idr numeric not null,           -- rate used for the fill (1 for IDR)
  fee_idr numeric not null,
  reason text not null default ''
);
create index on paper_trades (user_id, created_at);

-- One row per AI run: its market note and the two portfolio values right after it (snapshots).
create table paper_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default '',
  value_idr numeric not null,
  bench_idr numeric not null
);
create index on paper_runs (user_id, created_at);

alter table paper_accounts enable row level security;
alter table paper_trades enable row level security;
alter table paper_runs enable row level security;
create policy own_read on paper_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on paper_trades for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on paper_runs for select to authenticated using (user_id = (select auth.uid()));

-- Daily run at 09:00 WIB. Same bearer secret as the price refresh.
select cron.schedule('paper-lab', '0 2 * * *', $$
  select net.http_post(
    url := 'https://nilai-pied.vercel.app/api/paper',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
$$);
