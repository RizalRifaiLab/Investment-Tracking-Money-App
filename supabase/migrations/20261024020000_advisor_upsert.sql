-- Upsert (insert … on conflict do update) also sets user_id; RLS still pins it to auth.uid().
grant update (user_id) on advisor_settings to authenticated;
