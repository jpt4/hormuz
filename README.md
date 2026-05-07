Strait of Hormuz Tower Defense

A game for the current (2026MAR) state of foreign affairs, and an exercise in ML-assisted game programming. See the `experiments` folder for unused or failed attempts.

## Play

**[Play online](https://jpt4.github.io/hormuz/)** — choose between:

- **[Canonical Game](https://jpt4.github.io/hormuz/hormuz-game.html)** — original hand-tuned balance
- **[Experimental Balance](https://jpt4.github.io/hormuz/testing/)** — evolutionary self-play tuning applied (stats may change between runs)

Or download `hormuz-game.html` and open in a browser for offline play. Desktop recommended.

## Self-Play Balance System

The `self-play/` directory contains an autonomous balance-tuning system:

- **Headless engine** — runs the full game in Node.js (~9000 ticks/game, <1s) via `vm` sandbox
- **Evolutionary optimizer** — ~150-gene strategy genomes encoding build priorities, placement, upgrade policy
- **Balance analyzer** — detects dominant/underpowered units, monoculture strategies, difficulty signals
- **Rebalancer** — adjusts HP/DPS/cooldown (primary), cost (secondary), preserving 15 realism constraints

Run the balance loop:

```
node self-play/run.js balance          # full autonomous loop (evolve → analyze → adjust → repeat)
node self-play/run.js balance --cycles=8 --gen=20 --pop=60
node self-play/run.js balance --no-push # commit locally but don't push
node self-play/run.js test             # smoke test
```

Each cycle writes a timestamped config to `self-play/configs/`, updates `balance-config.js`, commits, and pushes. The GitHub Actions workflow redeploys the testing build automatically.

Convergence target ("edge of chaos"): 20-60% win rate, 4+ unit types in top strategies, 3+ distinct archetypes, no dominant unit >40% of kills.

## Contributing

Gameplay, visual/audio, performance, etc. improvements welcome, as is commentary/critique.

### Engineering policy

Development practices for this repository are described in **`AGENTS.md`** (TDD, ADRs before new features, documentation layers). Quick orientation:

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | Mandatory practices |
| `DESIGN.md` | Game design specification |
| `docs/COVERAGE.md` | What tests cover and known gaps |
| `docs/adr/` | Architecture Decision Records |
| `LOG.md` / `MEMORY.md` / `LESSONS.md` | Chronological log, durable facts, lessons |

### Tests

```bash
npm ci          # install deps (none yet; lockfile for CI reproducibility)
npm test        # fast suite — Node contract tests for self-play + bounded VM smoke
npm run test:extended   # slower — full headless game smoke (self-play/run.js)
```

The playable HTML file also includes an **in-browser regression suite** (Ctrl+T, runs on load).

Before commits that change game logic used by the headless engine or self-play pipeline, run **`npm run test:extended`** locally (see `docs/COVERAGE.md`).
