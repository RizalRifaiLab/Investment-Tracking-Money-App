-- Advisor: choose DeepSeek or Claude, each with its own encrypted key.
alter table advisor_settings
  add column provider text not null default 'deepseek' check (provider in ('deepseek', 'claude')),
  add column claude_key_enc text,     -- AES-256-GCM, written only by the server
  add column claude_key_hint text;
grant insert (provider), update (provider) on advisor_settings to authenticated;
grant select (provider, claude_key_hint) on advisor_settings to authenticated;
