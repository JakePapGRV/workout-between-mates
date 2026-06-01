-- ============================================================
--  Workout Challenge — Supabase schema
--  Run this once in Supabase:  SQL Editor → New query → paste → Run
-- ============================================================

-- --- Tables -------------------------------------------------

create table if not exists participants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists workouts (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references participants(id) on delete cascade,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_seconds integer not null,
  type             text not null,
  is_sick_day      boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists workouts_participant_idx on workouts(participant_id);
create index if not exists workouts_started_idx     on workouts(started_at);

-- --- Seed your mates ----------------------------------------
insert into participants (name) values
  ('Jake'),
  ('Trent'),
  ('Mitchell')
on conflict (name) do nothing;

-- --- Pre-load Week 1 (you all completed it before the app) --
--  Gives each mate 4 counting workouts in Week 1 (25-31 May) = $20.
--  These are generic placeholders — anyone can rename or delete
--  their own from the app's leaderboard. Safe to re-run (won't
--  duplicate once a person already has workouts logged).
insert into workouts (participant_id, started_at, ended_at, duration_seconds, type)
select p.id, t.s, t.e, 2700, 'Week 1 (logged before the app)'
from participants p
cross join (values
  (timestamptz '2026-05-26 12:00:00+00', timestamptz '2026-05-26 12:45:00+00'),
  (timestamptz '2026-05-27 12:00:00+00', timestamptz '2026-05-27 12:45:00+00'),
  (timestamptz '2026-05-29 12:00:00+00', timestamptz '2026-05-29 12:45:00+00'),
  (timestamptz '2026-05-30 12:00:00+00', timestamptz '2026-05-30 12:45:00+00')
) as t(s, e)
where p.name in ('Jake', 'Trent', 'Mitchell')
  and not exists (select 1 from workouts w where w.participant_id = p.id);

-- --- Row Level Security -------------------------------------
--  This is a small, private, honour-system app. The anon key is
--  public (it ships in the page), so RLS decides what it can do.
--  Below: anyone with the link can read the leaderboard, log a
--  workout, and delete a workout (to fix mistakes). No updates.
alter table participants enable row level security;
alter table workouts     enable row level security;

create policy "read participants"  on participants for select using (true);
create policy "add participants"   on participants for insert with check (true);

create policy "read workouts"      on workouts for select using (true);
create policy "add workouts"       on workouts for insert with check (true);
create policy "delete workouts"    on workouts for delete using (true);

-- --- Live updates (optional but nice) -----------------------
--  Lets the leaderboard refresh instantly on everyone's phone.
--  If either line errors with "already member", just ignore it.
alter publication supabase_realtime add table workouts;
alter publication supabase_realtime add table participants;
