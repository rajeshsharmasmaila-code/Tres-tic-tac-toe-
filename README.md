# Tres — Tic-Tac-Toe, rebuilt

A ground-up rebuild: real-time 2-player tic-tac-toe with accounts, profiles,
history, a leaderboard, and rematches that can't get stuck.

## What changed from the old version

- **Rematch can never hang.** Previously, whichever player was "Player X"
  had to be online at the exact right moment to create the rematch game,
  and if realtime hiccupped there was no fallback — that's why it used to
  get stuck at "Starting rematch...". Now a Postgres trigger creates the
  rematch **atomically inside the same UPDATE** the instant both players
  have agreed, regardless of which client's request triggers it. See
  `handle_rematch_ready()` in `schema.sql`.
- **One continuous poll loop** backs up realtime for the whole session
  (waiting → playing → finished → rematch) instead of separate timers that
  could stop and never restart.
- **Fresh UI**: dark "scoreboard" theme, hand-drawn marker-style X/O with a
  drawn-on animation, an animated winning strike-through, confetti on a win,
  bottom tab navigation (Play / History / Ranks / Profile).

## 1. Run the database migration

Open the SQL Editor for this project — `https://ovkhxtduzkvzkbluqjbs.supabase.co`
— and run **`schema.sql`** once. It's fully idempotent (safe to re-run).

It sets up:
- `profiles` (auto-created per user via a trigger on `auth.users`)
- `games` (with auto-assigned 6-digit codes)
- The atomic rematch trigger
- RLS policies for both tables
- `get_player_stats` / `get_leaderboard` RPC functions
- Adds `games` to the `supabase_realtime` publication

## 2. Check email confirmation setting

If you want people to be able to sign up and play immediately (no email
step), turn off **"Confirm email"** under Authentication → Providers →
Email in the Supabase dashboard. If it's left on, the app will tell new
users to check their email before logging in.

## 3. Serve the app

This is a static site — `index.html`, `css/style.css`, `js/config.js`,
`js/app.js`. Open `index.html` directly, or serve the folder with any
static host (Vercel, Netlify, GitHub Pages, `npx serve`, etc). No build
step needed. The Supabase URL and publishable key are already wired up in
`js/config.js`.

## 4. Play

- Sign up (two different accounts/browsers to test both sides), create a
  table, share the 6-digit code, and the second player joins from the Play
  tab. Moves sync in real time. When a game finishes, either player can
  request a rematch — once both do, the app jumps straight to the new
  table for both of you automatically.
