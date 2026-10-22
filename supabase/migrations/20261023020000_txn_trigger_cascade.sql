-- Deleting a user (Supabase Auth, role supabase_auth_admin) cascades to transactions; that role may not update
-- public.accounts, so the balance trigger failed and the user couldn't be deleted. Run it as the owner instead.
-- Safe: it only touches the account named on the row, which check_account_owner already tied to the row's user.
create or replace function apply_txn_to_balance() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.source <> 'import' then
    update public.accounts set balance = balance - old.amount where id = old.account_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.source <> 'import' then
    update public.accounts set balance = balance + new.amount where id = new.account_id;
  end if;
  return null;
end $$;
