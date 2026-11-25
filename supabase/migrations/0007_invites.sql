-- Invites: every reader gets one personal link (nancyreader.com/i/<code>).
-- Whoever signs up through it is recorded against the reader who shared it,
-- so we can see who brought whom.

create table public.invite_codes (
  code text primary key,
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.referrals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  code text not null,
  created_at timestamptz not null default now()
);

create index referrals_invited_by_idx on public.referrals (invited_by);

alter table public.invite_codes enable row level security;
alter table public.referrals enable row level security;

-- Readers see their own code, and who came in through it. Writes go through
-- the server (service role) only.
create policy "Own invite code" on public.invite_codes
  for select using (owner_id = (select auth.uid()));

create policy "People I invited" on public.referrals
  for select using (invited_by = (select auth.uid()));

-- For Robin: who invited whom, by email.
create view public.invite_tree with (security_invoker = true) as
  select r.created_at as joined_at,
         u.email as reader,
         i.email as invited_by,
         r.code
  from public.referrals r
  join auth.users u on u.id = r.user_id
  left join auth.users i on i.id = r.invited_by;

revoke all on public.invite_tree from anon, authenticated;
