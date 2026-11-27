# Docs

Scope: everything under `docs/`.

## Rules
- Numbered guideline files (`00`..`12`) are the source of truth; `CLAUDE.md` files summarize and link to them, they do not duplicate them.
- Any architectural decision gets an ADR in `adr/` from `0000-template.md`. Status lifecycle: Proposed -> Accepted -> Superseded/Deprecated. Never rewrite an accepted ADR; supersede it.
- Write in plain, imperative, testable language. Prefer tables and checklists. Keep each doc focused on one concern.
- When a convention or command changes, update the matching doc and the relevant `CLAUDE.md` in the same PR.
- Diagrams as Mermaid or ASCII in the markdown so they diff cleanly.
- Agent prompts that scaffold the repo live in `prompts/agent-prompts.md`; deviations found while running them are recorded in `../ACTIONS.md`, and the docs are corrected in the same session.

## Index
| Doc | Topic |
|---|---|
| `00` | Project overview: ExpenseFlow (detail superseded by the ARD) |
| `01` | Architecture, data flow, module/feature table |
| `02` | API contract, error envelope, spec lifecycle and sync |
| `03` / `05` | Database / backend guidelines |
| `04` | Frontend guidelines |
| `06` | Testing strategy |
| `07` / `09` | Git workflow / CI-CD |
| `08` | Docker, environments, env var contract |
| `10` | Definition of done |
| `11` | Onboarding |
| `12` | Security |
| `13` | ExpenseFlow domain design (superseded by the ARD) |
| `14` | ARD alignment: conflicts, gaps, closing plan |
| ARD | `/ExpenseFlow-Architecture Requirements Document (ARD).pdf` - the contract (ADR-0011) |

| ADR | Decision | Status |
|---|---|---|
| 0001 | Monorepo with hard package boundaries | Accepted |
| 0002 | Contract-first integration via OpenAPI | Accepted |
| 0003 | SQLite as the database | Accepted |
| 0004 | Browser talks to Next.js; `/api/*` proxied to FastAPI | Accepted (refined by 0008) |
| 0005 | Python Playwright for E2E and contract tests | Accepted |
| 0006 | Auth via HttpOnly cookies with short-lived JWTs | Accepted |
| 0007 | UUIDv7 identifiers | Accepted |
| 0008 | Frontend API access paths and build-time config | Accepted |
| 0009 | Materialised approval chain | Superseded by 0011 |
| 0010 | Policy as versioned configuration | Superseded by 0011 |
| 0011 | The ARD is the frontend/backend/database contract | Accepted |
