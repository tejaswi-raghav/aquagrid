# AquaGrid verification — 19 November 2026

Production application: https://aquagrid-network.vercel.app
Application source: `a003a2b0ebcde0e4adfc61073b49552262936f21`, branch `feature/decision-workspace`.
Vercel deployment `dpl_EUKLgHAs9SfzfKGvHGnxSF8XPV4n`: READY, production alias assigned. Frontend build and Python 3.12 dependency bundle completed successfully.

## Automated

49 backend tests pass (20 legacy narrative/model tests plus 29 operational workflow tests). TypeScript passes. Local Next.js production build passes with webpack; the normal Turbopack build also passes on Vercel. Desktop sandbox port restrictions prevent local Turbopack CSS worker startup.

`backend/tests/live_smoke.py https://aquagrid-network.vercel.app` passed against the live application and private Blob store. It creates its own isolated synthetic scenario and checks:

| Check | Observed result |
|---|---|
| EPANET on hosted Python | WNTR / EPANET 2.2 PDD solved successfully |
| Compound disruption | 65.514 m³/h solved emitter loss; separate FLATLINE sensor diagnosis |
| Inlet isolation | Hospital disconnection identified by graph; hydraulic pressure collapse; blocked |
| Candidate preview | Authoritative version unchanged |
| Unsafe peak throttling | Rejected, minimum reserve 30.45% |
| Analyst approval | HTTP 403, no state change |
| Simultaneous operator approvals | One HTTP 200 and one HTTP 409; exactly one outcome |
| Harbour isolation | Saved closed valve and near-zero leak; about 12 m³/h customer interruption |
| Optimized schedule | Feasible calculated schedule approved and persisted |
| Scenario Lab | Drift plus leak candidate approved through gateway and persisted |
| Direct AI actuation | HTTP 403 |
| Replay | Three saved outcomes, 31 audit events; read from cloud after execution |

The initial hosted check exposed EPANET's default scratch-file behavior on a read-only filesystem. The final deployment explicitly saves hydraulics in a unique `/tmp` directory and enables convergence errors. Cloud tests then passed; no static hydraulic fallback was introduced.

## Browser

Verified local operator sign-in, compound trigger, incident-to-asset selection, valve impact, staged approval with unchanged valve state, authorized simulated execution and saved replay, planning comparison and unsafe rejection, and Scenario Lab pump-failure/drift preview without state mutation. The deployed Control Room loads durable cloud state, signs in and triggers the same compound incident, with no console errors in that browser tab.

Verified mobile Control Room and homepage widths at 390 px: document scroll width equals viewport width. Removed projected 3D layer pills, sector labels and hover text; fixed layer toolbar and contextual inspector provide disclosure. Chart end labels no longer compete with threshold labels; the wrapped legend carries those labels instead. Public scrolling and `/plant` remain previews. The final story step now restores gated, persisted inline valve actions.

## Boundaries

This is a synthetic, simulation-only MVP. Hydraulic geometry and demand are reproducible but uncalibrated. The pump outage is a supply-link closure; no pump curve, transients or water-quality transport is modeled. Deterministic rules and optimization are used; no external LLM or physical actuator is connected. Audit is durable application history, not an immutable ledger. Demo identities and unguessable scenario IDs are not production tenant authentication.

Public scrolling previews a narrative seed. Inline staging creates a separate saved compound-disruption room; approvals go through the same durable gateway as `/control`, and opening the saved decision carries its room identifier into that workspace. The exact three service interfaces remain in `backend/aquagrid/services.py`; legacy stateless valve mutation endpoints return 410.


## Follow-up: retained story and non-overlapping layer key

- Restored inline harbour-valve staging, unsafe inlet what-if, operator login, analyst rejection and simulated approval on the public 14:20 story step. The existing durable gateway persists inputs, checks and outcomes. The 3D valve and leak animation update from that saved backend state.
- `create_story` initializes a new isolated compound-disruption scenario; it cannot overwrite an existing room. Its identifier is shared with the Control Room when the visitor opens the saved decision there.
- Hero text has its own layout region, separate from the canvas. Five numbered layer names and short descriptions occupy a reserved key beside the model on wide screens and below it on narrow screens. Selecting a label highlights its layer.
- Removed the remaining drei HTML portals from the scene. The awaiting-approval lock is now model geometry, avoiding DOM teardown races and projected-text collisions.
- 49 backend tests pass, including isolated story initialization and role-gated persisted story execution. Browser checks at 633 × 653 verified unsafe inlet rejection, analyst denial, operator approval and stopped leak animation. Caption/model DOM bounds do not intersect; document width equals viewport width.

- Follow-up production deployment is READY on the canonical alias. A live cloud test of `create_story` passed inlet rejection, harbour staging, analyst denial, operator approval and re-reading the persisted outcome: leak 0.014 m³/h, Sector 4 pressure 4.001 bar, 14 audit events.
- Live browser at 633 × 653 confirms five visible labels, zero caption/canvas intersection, no horizontal overflow and no console errors. Additional local checks at 390 and 1144 px confirm the same separation.
