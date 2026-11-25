-- Nancy is invite-only (the Instinct model). Robin decides who gets in:
-- an email must be on public.invites before an account can be created.
-- Existing accounts are untouched; the hook only runs on sign-up.
-- Replaces 0007's self-serve invite links.

drop view if exists public.invite_tree;
drop table if exists public.referrals;
drop table if exists public.invite_codes;

create table public.invites (
  email text primary key check (email = lower(email)),
  invited_by text,          -- who they came through (name or email)
  note text,
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;
-- No policies for anon/authenticated: only the service role, Robin's tools
-- and the auth hook (below) can read it.
grant select on public.invites to supabase_auth_admin;
create policy "Auth hook reads invites" on public.invites
  for select to supabase_auth_admin using (true);

create or replace function public.hook_invite_only(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if exists (select 1 from public.invites where email = lower(event->'user'->>'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Nancy is invite-only for now.'));
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_invite_only to supabase_auth_admin;
revoke execute on function public.hook_invite_only from authenticated, anon, public;

-- Who's in, who brought them, and whether they've signed up.
create view public.invite_list with (security_invoker = true) as
  select i.email, i.invited_by, i.note, i.created_at as invited_at,
         u.created_at as signed_up_at, u.last_sign_in_at
  from public.invites i
  left join auth.users u on lower(u.email) = i.email;

revoke all on public.invite_list from anon, authenticated;
