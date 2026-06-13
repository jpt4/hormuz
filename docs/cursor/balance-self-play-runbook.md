# Cloud balance runbook (Cursor Automations)

**Purpose:** Procedural instructions for Cursor Cloud Agents running the self-play balance loop on branch **`self-play`**. Do not reinterpret balance design or edit game source — execute commands only.

**ADR:** [0006 — Cloud self-play balance workflow](../adr/0006-cloud-self-play-balance.md)

---

## Automation schedule

| Phase | Cadence | Cron (UTC) | When to switch |
|-------|---------|------------|----------------|
| **Bootstrap** (initial) | **Daily** | `0 6 * * *` | After automation is verified working |
| **Steady state** | **Weekly** | `0 6 * * 0` | When balance reaches equilibrium |

### Equilibrium criteria (move daily → weekly)

Switch the Automation cron from daily to weekly when **all** of the following hold for **3 consecutive daily runs**:

1. Balance loop completes without git or test failures.
2. `rebalancer.isBalanced(analysis)` reports balanced (or win rate within 25–45% and diversity ≥ 60% per cycle summary).
3. Override deltas between runs are small (no large swings in `balance-config.js` keys).

Document the switch date in a commit message or `LOG.md` entry when updating the Automation trigger.

---

## Cursor Automation settings

Configure at [cursor.com/automations](https://cursor.com/automations):

| Field | Value |
|-------|--------|
| Name | `hormuz-self-play-balance` |
| Repository | `jpt4/hormuz` |
| Branch | `self-play` |
| Trigger (bootstrap) | Cron `0 6 * * *` (daily 06:00 UTC) |
| Trigger (steady) | Cron `0 6 * * 0` (weekly Sunday 06:00 UTC) |
| Environment | Repo [`.cursor/environment.json`](../../.cursor/environment.json) |
| Instructions | Paste the **Agent prompt** section below |

### Cloud Agent secrets (dashboard)

| Secret | Purpose |
|--------|---------|
| `GITHUB_TOKEN` or `GIT_TOKEN` | Push to `origin/self-play` (contents: write) |
| `CURSOR_CLOUD=1` | Optional; marks unattended runs (also set by VM) |

Optional overrides:

| Variable | Default |
|----------|---------|
| `BALANCE_GIT_USER_NAME` | `hormuz-self-play-bot` |
| `BALANCE_GIT_USER_EMAIL` | `hormuz-self-play-bot@users.noreply.github.com` |

---

## Agent prompt (copy into Automation)

```
You are running the Hormuz self-play balance job. Follow these steps exactly.
Do NOT edit hormuz-game.html, self-play/*.js (except as already committed), or game logic.
Do NOT change balance parameters manually — only run the CLI pipeline.

1. git checkout self-play && git pull origin self-play
2. export CURSOR_CLOUD=1
3. npm ci && npm test
   - If tests fail, stop and report failure. Do not commit.
4. node self-play/run.js balance --cycles=2 --gen=8 --pop=25
   - This runs evolution + rebalancer and commits/pushes via config-writer.js.
5. Report in your summary:
   - Win rate and diversity from the last cycle
   - Git commit hash (if any)
   - Whether rebalancer reported BALANCED
   - Testing URL: https://jpt4.github.io/hormuz/testing/

If git push fails, report the error and exit non-zero. Do not retry with code edits.
```

### Manual dispatch overrides

For a lighter smoke run:

```bash
node self-play/run.js balance --cycles=1 --gen=4 --pop=15 --dry-run
```

For local debugging without push:

```bash
node self-play/run.js balance --cycles=2 --gen=8 --pop=25 --no-push
```

---

## What happens after push

1. [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) runs on push to `self-play`.
2. Testing build updates at https://jpt4.github.io/hormuz/testing/
3. Canonical build (master, empty overrides) is unchanged.

---

## Failure handling

| Symptom | Action |
|---------|--------|
| Agent edits game source | Tighten Automation prompt; review agent transcript |
| `npm test` fails | Fix on `master` / merge to `self-play`; do not bypass tests |
| Git push auth failure | Verify `GITHUB_TOKEN` secret and branch protection |
| Run timeout / cost | Reduce `--gen` / `--pop`; consider weekly-only sooner |
| No commit (skipped) | Normal if overrides unchanged; still report metrics |
| Stuck on "Running start script" | Cancel run; delete saved environment (dashboard → Environments); ensure repo `.cursor/environment.json` is on `self-play`; re-dispatch. Do not use a custom `start` script — only `install`. |

---

## Stuck on "Running start script"

This usually means the **saved Cloud environment** is blocked, not the balance job itself.

**Common causes**

1. **Repo config not on `self-play`** — Automation checks out `self-play`; if `.cursor/environment.json` is not merged there, Cursor falls back to a **dashboard personal environment** that may have a blocking `start` command (DB, docker compose, etc.).
2. **Dockerfile first build** — Slow or hung; we use install-only config (no Dockerfile) to avoid this.
3. **Old snapshot** — Restored from a broken environment setup.

**Fix (in order)**

1. **Cancel** the stuck automation run.
2. Open [cursor.com/dashboard/cloud-agents → Environments](https://cursor.com/dashboard/cloud-agents#environments).
3. **Delete** the saved environment for `jpt4/hormuz` (forces a clean setup on next run).
4. Ensure branch **`self-play`** contains [`.cursor/environment.json`](../../.cursor/environment.json) with only:
   ```json
   { "name": "hormuz-self-play-balance", "install": "node --version && npm ci" }
   ```
   No `start` script. No Dockerfile unless you need custom system packages.
5. **Manual dispatch** the automation again. First boot should finish in **under 2 minutes** (empty `npm ci`).
6. If still stuck after 10 minutes, open the run at [cursor.com/agents](https://cursor.com/agents) → click **Open setup** on any warning banner, or check **Environments → Setup runs** for errors.

---

## Parameter reference

Cloud-safe defaults (~800 games, ~20–40 min):

```
--cycles=2 --gen=8 --pop=25
```

Full local evolution (hours — not for daily cron):

```
--cycles=5 --gen=30 --pop=50
```
