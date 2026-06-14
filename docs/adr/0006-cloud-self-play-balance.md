# ADR 0006: Cloud self-play balance workflow

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The self-play balance loop ([`self-play/run.js balance`](../../self-play/run.js)) evolves strategies, applies the rebalancer, writes [`balance-config.js`](../../balance-config.js), and commits to branch **`self-play`**. Default parameters (`5×30×50×2`) require multi-hour runs unsuitable for routine automation.

We need a **hosted runner** that:

- Runs headless Node (no browser) on a schedule without a local machine.
- Pushes balance commits to `self-play` so the existing GitHub Pages testing deploy updates automatically.
- Starts on a **daily** cadence to verify automation, then moves to **weekly** once balance reaches equilibrium.

Alternatives considered:

| Option | Outcome |
|--------|---------|
| **Cursor Cloud Automations** | Selected — long VM runs, repo secrets, cron + manual dispatch. |
| **GitHub Actions balance job** | Rejected as primary — viable fallback only; duplicates Cursor intent. |
| **Local cron** | Rejected — not cloud; blocks on developer hardware. |

## Decision

1. **Primary runner:** Cursor Cloud Agents + [Automations](https://cursor.com/automations) on branch **`self-play`**, following the runbook on that branch: [`docs/cursor/balance-self-play-runbook.md`](https://github.com/jpt4/hormuz/blob/self-play/docs/cursor/balance-self-play-runbook.md).
2. **Environment:** [`.cursor/environment.json`](https://github.com/jpt4/hormuz/blob/self-play/.cursor/environment.json) on **`self-play`** only (`npm ci` on boot).
3. **Schedule:**
   - **Phase 1 (bootstrap):** daily cron `0 6 * * *` (06:00 UTC).
   - **Phase 2 (steady):** weekly cron `0 6 * * 0` after **3 consecutive daily runs** meet equilibrium criteria (see runbook).
4. **Balance parameters (cloud):** `--cycles=2 --gen=8 --pop=25`.
5. **Deploy:** unchanged — push to `self-play` triggers [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml).
6. **Unattended git:** [`config-writer.js`](../../self-play/config-writer.js) sets bot identity, uses `GITHUB_TOKEN`/`GIT_TOKEN` for push, exits non-zero on failure when `CI`, `CURSOR_CLOUD`, or `GITHUB_ACTIONS` is set.
7. **Baseline:** on **`self-play`**, reset stale pre–ADR-0005 `balance-config.js` to `{}` before first cloud cycle.
8. **Branch separation:** `balance-config.js`, `self-play/configs/`, balance runbook, and `.cursor/environment.json` are **`self-play`-branch artifacts**. **`master`** keeps canonical empty overrides only; do **not** merge self-play balance commits onto `master`.
9. **No `GAME_VERSION` bump** — infrastructure-only ADR.

## Consequences

**Positive**

- Balance runs while developer machines are off.
- Testing Pages build updates automatically after each successful push.
- Daily cadence validates automation quickly; weekly reduces cost once stable.

**Negative**

- Cursor Cloud usage billing; agent must follow a strict runbook to avoid unsolicited code edits.
- Equilibrium detection is heuristic (3 balanced daily runs); operator may switch cadence manually.
- Rebalancer still does not tune `ADAPT_*` (ADR 0005) — follow-up optional.

## Success criteria

- Cursor Automation completes on daily schedule without local intervention.
- `npm test` passes before balance; git commit appears on `self-play` when overrides change.
- Testing URL https://jpt4.github.io/hormuz/testing/ reflects new `balance-config.js`.
- After verification, operator switches Automation to weekly cron per runbook.

## Failure criteria

- Agent repeatedly modifies game source → tighten runbook; consider GHA deterministic fallback.
- Push/auth failures persist → fix Cloud secrets; use `--dry-run` for diagnosis.
- Daily runs never reach equilibrium → review rebalancer targets or cloud params; do not disable tests.

## Links

- Runbook (self-play branch): [balance-self-play-runbook.md](https://github.com/jpt4/hormuz/blob/self-play/docs/cursor/balance-self-play-runbook.md)
- Deploy workflow: [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)
- Prior balance tooling split: `LOG.md` 2026-06-13
