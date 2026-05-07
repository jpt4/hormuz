# Architecture Decision Records (Hormuz)

Per **AGENTS.md**, substantive features are preceded by an ADR. Records use the template in `template.md`.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-repository-governance-and-quality-gates.md) | Repository governance, documentation layers, and test gates | Accepted |
| [0002](./0002-upgrade-pricing-as-fraction-of-base.md) | Upgrade gold cost as fractions of base unit price | Accepted |

## How to add an ADR

1. Copy `template.md` to `NNNN-short-title.md` with the next sequence number.
2. Fill Context, Decision, Consequences, Success / Failure criteria.
3. Implement the change behind that decision.
4. Add an **After Action Report** file: `NNNN-short-title-AAR.md` summarizing outcomes and what to revisit.

The project design in `DESIGN.md` is the product specification; ADRs capture **process and engineering choices** that implement or constrain that design.
