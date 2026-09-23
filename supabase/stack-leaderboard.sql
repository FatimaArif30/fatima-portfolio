-- Stack to the Stars leaderboard. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1) Remove the old Lunar Lander leaderboard (this also deletes the "TST" test score).
drop function if exists public.submit_lander_score(text, integer, integer, integer, numeric);
drop table if exists public.lander_scores;

-- 2) New table: anyone can read, nobody can write directly.
create table if not exists public.stack_scores (
  id          bigint generated always as identity primary key,
  initials    text        not null check (initials ~ '^[A-Z]{3}$'),
  score       integer     not null check (score between 1 and 400),
  created_at  timestamptz not null default now()
);
create index if not exists stack_scores_top_idx on public.stack_scores (score desc, created_at asc);

alter table public.stack_scores enable row level security;
drop policy if exists "Stack scores are public" on public.stack_scores;
create policy "Stack scores are public" on public.stack_scores for select using (true);
revoke insert, update, delete on public.stack_scores from anon, authenticated;
grant select on public.stack_scores to anon, authenticated;

-- 3) The only way to add a score. Each stage takes real time to slide in,
--    so a score must come with a believable play time.
create or replace function public.submit_stack_score(
  p_initials text,
  p_score    integer,
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
  if p_score is null or p_score < 1 or p_score > 400 then
    raise exception 'Score out of range';
  end if;
  if p_seconds is null or p_seconds < p_score * 0.3 or p_seconds > 7200 then
    raise exception 'Score does not match the play time';
  end if;
  if (select count(*) from stack_scores where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many scores right now, try again in a minute';
  end if;

  insert into stack_scores (initials, score) values (p_initials, p_score);
  select count(*) + 1 into v_rank from stack_scores where score > p_score;
  return v_rank;
end;
$$;

revoke all on function public.submit_stack_score(text, integer, numeric) from public;
grant execute on function public.submit_stack_score(text, integer, numeric) to anon, authenticated;
