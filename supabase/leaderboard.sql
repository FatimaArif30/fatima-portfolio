-- Lunar Lander leaderboard for Fatima's portfolio.
-- Run this once in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.lander_scores (
  id          bigint generated always as identity primary key,
  initials    text        not null check (initials ~ '^[A-Z]{3}$'),
  score       integer     not null check (score between 1 and 10000),
  pad         smallint    not null check (pad in (1, 2, 3, 5)),
  created_at  timestamptz not null default now()
);

create index if not exists lander_scores_top_idx on public.lander_scores (score desc, created_at asc);

-- Row Level Security: anyone can READ scores, nobody can write directly.
alter table public.lander_scores enable row level security;

drop policy if exists "Scores are public" on public.lander_scores;
create policy "Scores are public" on public.lander_scores
  for select using (true);

revoke insert, update, delete on public.lander_scores from anon, authenticated;
grant select on public.lander_scores to anon, authenticated;

-- The ONLY way to add a score. It checks the numbers match the game rules:
-- score = (softness bonus 0..500 + fuel left 0..1000) x pad multiplier.
create or replace function public.submit_lander_score(
  p_initials text,
  p_score    integer,
  p_fuel     integer,
  p_pad      integer,
  p_seconds  numeric
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank integer;
begin
  if p_initials is null or p_initials !~ '^[A-Z]{3}$' then
    raise exception 'Initials must be 3 letters A-Z';
  end if;
  if p_pad not in (1, 2, 3, 5) then
    raise exception 'Unknown landing pad';
  end if;
  if p_fuel < 0 or p_fuel > 1000 then
    raise exception 'Fuel out of range';
  end if;
  if p_seconds < 8 or p_seconds > 900 then
    raise exception 'Flight time out of range';
  end if;
  if p_score < 1 or p_score > (p_fuel + 500) * p_pad then
    raise exception 'Score does not match the flight';
  end if;
  -- simple flood guard: at most 30 new scores per minute for everyone
  if (select count(*) from lander_scores where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many scores right now, try again in a minute';
  end if;

  insert into lander_scores (initials, score, pad) values (p_initials, p_score, p_pad);

  select count(*) + 1 into v_rank from lander_scores where score > p_score;
  return v_rank;
end;
$$;

revoke all on function public.submit_lander_score(text, integer, integer, integer, numeric) from public;
grant execute on function public.submit_lander_score(text, integer, integer, integer, numeric) to anon, authenticated;
