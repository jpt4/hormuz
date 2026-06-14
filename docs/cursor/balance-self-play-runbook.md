# Cloud balance runbook (Cursor Cloud Agents)

**Purpose:** Procedural instructions for Cursor Cloud Agents running the self-play balance loop on branch **`self-play`**. Do not reinterpret balance design or edit game source — execute commands only.

**ADR:** [0006 — Cloud self-play balance workflow](../adr/0006-cloud-self-play-balance.md)

**Recommended when Automations hang on startup:** use **Manual environment + Cloud Agent launch** (below) instead of Automations until boot is reliable.

---

## Manual environment + Cloud Agent launch (preferred for first run)

Use this path when Automations stay on “Running start script”. You control environment setup in the dashboard, then launch one agent with the balance prompt.

### Step 1 — Create the environment

**Note:** The Environments wizard selects the **repo only**, not a branch. Branch is chosen when you **launch an agent** (Step 2). Repo [`.cursor/environment.json`](../../.cursor/environment.json) is applied from the branch the agent starts on (`self-play`).

1. Open **[cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents)** → **Environments**.
2. Click **Create environment** (or **New Setup Run** on an existing `jpt4/hormuz` row).
3. Select repository **`jpt4/hormuz`** (no branch picker here — expected).
4. **Install / update script** — type manually if repo config is not loaded:
   ```bash
   node --version && npm ci
   ```
5. **Start script:** leave **empty**.
6. **Do not** enable a custom Dockerfile for first success.
7. Run setup. Wait for **Environment ready** (typically under 2 minutes).
8. **Save snapshot** (Personal or Team).

Optional: **Dashboard → My Settings → Base branch → `self-play`** (PR fork default; does not replace Step 2).

If setup shows **“Error loading default branch”**, set the install script manually and save the snapshot anyway — launch on `self-play` in Step 2.

### Step 2 — Launch a Cloud Agent (not Automation)

1. Open **[cursor.com/agents](https://cursor.com/agents)** (or Cursor desktop → agent input → **Cloud**).
2. Repository: **`jpt4/hormuz`**
3. **Branch: `self-play`** ← required; this is where branch is chosen (not on Environments page).
4. Environment: select the snapshot you saved in Step 1.
5. Paste the **Agent prompt** (below) as the task.
6. Start the agent.

If the branch dropdown is disabled: check **Settings → Privacy** — Legacy Privacy Mode blocks Cloud Agents; use a non-legacy privacy setting.

GitHub read/write integration must already be connected (no PAT required for push in most cases).

### Step 3 — Verify success

- Agent log shows `npm test` then `node self-play/run.js balance ...`
- New commit on **`self-play`** (if overrides changed)
- [Pages deploy](https://github.com/jpt4/hormuz/actions) runs
- https://jpt4.github.io/hormuz/testing/ updates

### Step 4 — Automations later (optional)

After manual launch works once, wire [Automations](https://cursor.com/automations) to the **same saved environment** and the same prompt. If Automations still hang, keep using manual Cloud Agent launch on a schedule (calendar reminder) until Cursor fixes automation boot.

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
| **Pull request creation tool** | **Off / disabled** — balance pushes directly to `self-play` |
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

## Agent prompt (copy into Cloud Agent or Automation)

```
You are running the Hormuz self-play balance job. Follow these steps exactly.
Do NOT edit hormuz-game.html, self-play/*.js (except as already committed), or game logic.
Do NOT change balance parameters manually — only run the CLI pipeline.

Do NOT create a pull request. Do NOT work on a cursor/* branch.
Commits must land on self-play via config-writer.js only.

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
Do not open a pull request when finished.
```

---

## "Failed to open Pull Request" (safe to ignore)

Cursor Cloud Agents default to working on a **`cursor/...`** branch and may try to **open a PR** when the run ends. The balance pipeline is different: [`config-writer.js`](../../self-play/config-writer.js) commits and **pushes directly to `self-play`**.

**If you see:** `Failed to open Pull Request — This branch is not pushed to the remote`

| Check | Expected |
|-------|----------|
| Commits on **`self-play`** on GitHub | `balance: cycle N — win X% div Y%` |
| [`balance-config.js`](../../balance-config.js) updated | Yes |
| [Deploy to GitHub Pages](https://github.com/jpt4/hormuz/actions) | Ran on push to `self-play` |
| Testing URL | https://jpt4.github.io/hormuz/testing/ |

If those are true, **the balance job succeeded** — the PR error is Cursor failing to PR its own agent branch, not your balance push.

**Prevent the error:** In Automation settings, **disable the "Pull request creation" tool**. Add to the prompt: *Do not create a pull request.*

Optional cleanup: delete stale `cursor/setup-dev-environment-*` branches on GitHub if environment setup runs created them.

---

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
| Stuck on "Running start script" | **Skip Automations.** Create environment manually (above), launch from [cursor.com/agents](https://cursor.com/agents). Empty **Start** script; install only `node --version && npm ci`. |

---

## Stuck on "Running start script" (Automations)

Automations often inherit a broken **personal environment** or a non-empty **Start** script. Full **Delete** is not always available in the dashboard.

**Prefer:** Manual environment + Cloud Agent launch (top of this doc).

**If you stay on Automations:**

1. **Cancel** the stuck run.
2. [Environments](https://cursor.com/dashboard/cloud-agents#environments) → **Remove personal environment** or **New Setup Run** on `jpt4/hormuz`.
3. Confirm **`self-play`** has [`.cursor/environment.json`](../../.cursor/environment.json) (install-only, no `start`).
4. Re-dispatch Automation only after a **manual** Cloud Agent run succeeds on the same snapshot.

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
