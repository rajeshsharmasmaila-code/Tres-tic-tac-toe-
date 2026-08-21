# Tres — Tic-Tac-Toe MAX

A feature-expanded version of Tres.

## Modes
- Online 2-player using the existing Supabase backend and 6-digit numeric room codes.
- Local 2-player on one device.
- AI challenge with Easy, Medium and Hard levels.
- Local 3×3, 4×4 and 5×5 boards with configurable win length.
- Best of 3 / Best of 5 local series.
- Sound effects and haptic feedback toggles saved on the device.
- Installable PWA/offline shell.

## Online
The original online functionality, profiles, history, leaderboard, realtime sync, rematch and numeric 6-digit codes remain in place.

## Deploy
Upload the contents of `Tres-tic-tac-toe--main` to your static host. Keep the Supabase URL/key in `js/config.js` as configured for the project, and run `schema.sql` in Supabase when setting up the backend.

## Important
For a production-grade competitive game, server-side atomic move validation/RPC should be added before exposing ranked play publicly. The existing schema's client update policy is intentionally retained here so this extension remains compatible with the current project.
