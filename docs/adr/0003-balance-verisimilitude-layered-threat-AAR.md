# ADR 0003 — After Action Report

- **ADR:** [0003-balance-verisimilitude-layered-threat.md](./0003-balance-verisimilitude-layered-threat.md)
- **Date completed:** 2026-06-13

## Outcome

Implemented on **`master`** in `hormuz-game.html`:

- Deployment grid, destroyer inland restriction, Tomahawk splash, defend-phase salvos, convoy packets, inland threat weights, destroyer flak (VFX/SFX only), route/interdiction intel alerts, island/shallow bonuses, F-14 oil milestones.
- Extended embedded regression tests and headless reset for new `GameState` fields.

## Verification

- Embedded regression suite (Ctrl+T): ADR 0003 assertions added.
- `npm test`: fast self-play unit tests.
- `npm run test:extended`: headless smoke after engine reset updates.

## Revisit when

- Self-play fitness or win-rate data suggests inland weights or salvo sizes need retuning.
- Selective cherry-pick to **`self-play`** if balance loop should experiment with the new override keys.
- Player feedback on convoy pacing or interdiction cadence (`INTERDICTION_EVERY_N_WAVES`).
