-- Advisor: per-user editable rules, model choice, and an optional own DeepSeek key.
create table advisor_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  rules text,                         -- null = default rules
  model text not null default 'deepseek-flash' check (model in ('deepseek-flash', 'deepseek-v4-pro')),
  api_key_enc text,                   -- AES-256-GCM, written only by the server
  key_hint text                       -- last 4 characters, for display
);
alter table advisor_settings enable row level security;
create policy own on advisor_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- The browser may edit rules/model but never touch the key columns.
revoke insert, update on advisor_settings from authenticated;
grant insert (user_id, rules, model), update (rules, model) on advisor_settings to authenticated;
revoke select on advisor_settings from authenticated;
grant select (user_id, rules, model, key_hint) on advisor_settings to authenticated;
