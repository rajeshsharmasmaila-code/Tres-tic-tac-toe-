-- ==========================================================
-- TIC-TAC-TOE — FULL SCHEMA (fresh build)
-- Run once in the Supabase SQL Editor for this project:
--   https://ovkhxtduzkvzkbluqjbs.supabase.co
--
-- Safe to re-run: every object uses IF EXISTS / OR REPLACE /
-- IF NOT EXISTS, so re-running this file just resyncs things.
-- ==========================================================

begin;

-- ----------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------

create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    username    text not null default 'Player',
    avatar      text not null default '🙂',
    created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up, so the
-- client never has to (and never races the client on first login).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, username, avatar)
    values (new.id, 'Player-' || upper(substr(new.id::text, 1, 4)), '🙂')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------
-- 2. GAME CODES
-- ----------------------------------------------------------

create or replace function public.generate_game_code()
returns text
language plpgsql
as $$
declare
    candidate text;
    taken boolean;
begin
    loop
        candidate := lpad(floor(random() * 1000000)::text, 6, '0');
        select exists(
            select 1 from public.games where game_code = candidate
        ) into taken;
        exit when not taken;
    end loop;
    return candidate;
end;
$$;

-- ----------------------------------------------------------
-- 3. GAMES
-- ----------------------------------------------------------

create table if not exists public.games (
    id               uuid primary key default gen_random_uuid(),
    game_code        text unique,
    player_x         uuid references public.profiles(id),
    player_o         uuid references public.profiles(id),
    board            jsonb not null default '["","","","","","","","",""]'::jsonb,
    current_turn     text not null default 'X',
    status           text not null default 'waiting',
    winner           text,
    rematch_x        boolean not null default false,
    rematch_o        boolean not null default false,
    rematch_game_id  uuid references public.games(id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),

    constraint games_board_shape_check check (
        jsonb_typeof(board) = 'array' and jsonb_array_length(board) = 9
    ),
    constraint games_current_turn_check check (current_turn in ('X', 'O')),
    constraint games_winner_check check (winner is null or winner in ('X', 'O', 'draw')),
    constraint games_status_check check (status in ('waiting', 'playing', 'finished'))
);

create index if not exists games_game_code_idx on public.games (game_code);
create index if not exists games_player_x_created_at_idx on public.games (player_x, created_at desc);
create index if not exists games_player_o_created_at_idx on public.games (player_o, created_at desc);
create index if not exists games_rematch_game_id_idx on public.games (rematch_game_id);

-- Auto-assign a game code on insert if the client didn't supply one.
create or replace function public.assign_game_code()
returns trigger
language plpgsql
as $$
begin
    if new.game_code is null then
        new.game_code := public.generate_game_code();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_assign_game_code on public.games;
create trigger trg_assign_game_code
before insert on public.games
for each row execute function public.assign_game_code();

-- Keep updated_at current on every change.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_games_touch_updated_at on public.games;
create trigger trg_games_touch_updated_at
before update on public.games
for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------
-- 4. ATOMIC REMATCH CREATION
--
-- The client only ever flips rematch_x / rematch_o to true.
-- The instant BOTH are true on a finished game, this trigger
-- creates the new game and stamps rematch_game_id — all inside
-- the same UPDATE statement, on the server, regardless of which
-- of the two players' browsers happened to trigger it. Neither
-- client has to stay online, "win a race", or poll forever for
-- this to happen.
-- ----------------------------------------------------------

create or replace function public.handle_rematch_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_game_id uuid;
begin
    if new.status = 'finished'
       and new.rematch_x and new.rematch_o
       and new.rematch_game_id is null then

        insert into public.games (player_x, player_o, current_turn, status)
        values (new.player_x, new.player_o, 'X', 'playing')
        returning id into new_game_id;

        new.rematch_game_id := new_game_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_rematch_ready on public.games;
create trigger trg_rematch_ready
before update on public.games
for each row execute function public.handle_rematch_ready();

-- ----------------------------------------------------------
-- 5. ROW LEVEL SECURITY — GAMES
-- ----------------------------------------------------------

alter table public.games enable row level security;

drop policy if exists "games_select" on public.games;
create policy "games_select"
on public.games for select
to authenticated
using (
    status = 'waiting'
    or auth.uid() = player_x
    or auth.uid() = player_o
);

drop policy if exists "games_insert_own" on public.games;
create policy "games_insert_own"
on public.games for insert
to authenticated
with check (
    auth.uid() = player_x
    and player_o is null
    and status = 'waiting'
    and current_turn = 'X'
);

drop policy if exists "games_update_participant_or_join" on public.games;
create policy "games_update_participant_or_join"
on public.games for update
to authenticated
using (
    auth.uid() = player_x
    or auth.uid() = player_o
    or (status = 'waiting' and player_o is null)
)
with check (
    auth.uid() = player_x
    or auth.uid() = player_o
);

-- No delete policy: games are never deletable by regular users.

-- ----------------------------------------------------------
-- 6. STATS + LEADERBOARD
-- ----------------------------------------------------------

create or replace function public.get_player_stats(p_user_id uuid)
returns table (
    games_played bigint,
    wins bigint,
    losses bigint,
    draws bigint,
    win_rate numeric
)
language sql
security definer
set search_path = public
as $$
    with completed as (
        select
            case when player_x = p_user_id then 'X' else 'O' end as my_symbol,
            winner
        from public.games
        where status = 'finished'
          and (player_x = p_user_id or player_o = p_user_id)
    )
    select
        count(*)::bigint as games_played,
        count(*) filter (where winner = my_symbol)::bigint as wins,
        count(*) filter (where winner is not null and winner <> 'draw' and winner <> my_symbol)::bigint as losses,
        count(*) filter (where winner = 'draw')::bigint as draws,
        case when count(*) = 0 then 0::numeric
             else round((count(*) filter (where winner = my_symbol)) * 100.0 / count(*), 1)
        end as win_rate
    from completed;
$$;

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (
    user_id uuid,
    username text,
    avatar text,
    games_played bigint,
    wins bigint,
    losses bigint,
    draws bigint,
    win_rate numeric
)
language sql
security definer
set search_path = public
as $$
    with completed as (
        select player_x as user_id, 'X'::text as my_symbol, winner
        from public.games
        where status = 'finished' and player_x is not null
        union all
        select player_o as user_id, 'O'::text as my_symbol, winner
        from public.games
        where status = 'finished' and player_o is not null
    ),
    stats as (
        select
            user_id,
            count(*)::bigint as games_played,
            count(*) filter (where winner = my_symbol)::bigint as wins,
            count(*) filter (where winner is not null and winner <> 'draw' and winner <> my_symbol)::bigint as losses,
            count(*) filter (where winner = 'draw')::bigint as draws
        from completed
        group by user_id
    )
    select
        p.id,
        coalesce(p.username, 'Player')::text,
        coalesce(p.avatar, '🙂')::text,
        s.games_played,
        s.wins,
        s.losses,
        s.draws,
        round(s.wins * 100.0 / nullif(s.games_played, 0), 1) as win_rate
    from stats s
    join public.profiles p on p.id = s.user_id
    order by s.wins desc,
             (s.wins * 100.0 / nullif(s.games_played, 0)) desc,
             s.games_played desc,
             p.username asc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.get_player_stats(uuid) from public;
revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_player_stats(uuid) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;

-- ----------------------------------------------------------
-- 7. REALTIME
-- ----------------------------------------------------------

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'games'
    ) then
        alter publication supabase_realtime add table public.games;
    end if;
end $$;

commit;

-- ==========================================================
-- Verify policies after running:
-- ==========================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'games')
order by tablename, policyname;
