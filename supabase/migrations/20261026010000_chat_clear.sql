-- Users can clear their own advisor chat.
create policy own_delete on chat_messages for delete to authenticated using (user_id = (select auth.uid()));
