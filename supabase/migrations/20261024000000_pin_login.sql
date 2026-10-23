-- Sign in on a new device with email + PIN (no email code). Called only by the server route /api/auth/pin
-- with the service role; it then issues the session. Same 5-try lockout as verify_pin.

create function pin_login(p_email text, p_pin text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.pins;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is not null then select * into p from public.pins where user_id = uid for update; end if;
  if p is null then return jsonb_build_object('status', 'none'); end if;
  if p_pin is null then return jsonb_build_object('status', 'has_pin'); end if;
  if p.pin_hash = extensions.crypt(p_pin, p.pin_hash) then
    update public.pins set failed = 0 where user_id = uid;
    return jsonb_build_object('status', 'ok');
  end if;
  if p.failed + 1 >= 5 then
    update public.pins set failed = 0 where user_id = uid;
    delete from auth.sessions where user_id = uid;
    return jsonb_build_object('status', 'locked');
  end if;
  update public.pins set failed = p.failed + 1 where user_id = uid;
  return jsonb_build_object('status', 'wrong', 'left', 5 - (p.failed + 1));
end $$;

revoke execute on function pin_login from public, anon, authenticated;
grant execute on function pin_login to service_role;
