# AquaGrid

A cinematic infrastructure story connected to a persistent, simulation-only operational decision workspace. Three routes: `/` explains the city and compound incident; `/plant` explores the six-stage RO plant; `/control` investigates evidence, compares scenarios and approves changes. The supplied AquaGrid artwork remains the identity. Public pages use navy; operations use the requested industrial teal, gold and off-white palette.

## Run

Node 22+, Python 3.12 or 3.13:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm ci
npm run dev:api
# second terminal, same virtual environment
npm run dev
```

The Python server listens on 8000. Next.js proxies `/api/*` there. `PORT` changes the API port and `AQUAGRID_API_ORIGIN` changes the proxy target. Local operational state is in `data/operations.sqlite` (gitignored); `AQUAGRID_DB` overrides it.

```sh
python -m unittest discover -s backend/tests -v
npm run typecheck
npm run build
```

Local verification passed 47 tests, TypeScript and a production build with `next build --webpack`. Turbopack's local CSS worker is blocked by the desktop sandbox's port-binding restriction; webpack produces the supported equivalent Next.js bundle. Vercel uses its normal configured builder.

## Judge walkthrough

1. Open `/control`, sign in using **CR-07 / 2468**. **AN-02 / 1357** is an analyst and cannot approve. Demo identities authorize synthetic assets only.
2. Trigger the 14:00 disruption. Select the harbour incident. The mass-balance residual is about 65.5 m³/h; P-S4B is separately classified FLATLINE and quarantined. Inspect sensor samples, variance, residual, timestamp, pipe ranking and assumptions.
3. In Investigate → Scenario Lab, preview leak, pump failure, sensor flatline/drift, demand spike, tariff multiplier or intake warning. Candidate previews never change applied state. Stage and approve a candidate to apply synthetic faults.
4. In Decide → Production planning, compare the current schedule, calculated optimizer result and unsafe peak throttle. Stage the unsafe plan to retain a blocked proposal. The 35% floor cannot be overridden. A quality warning separately blocks production changes. Reset to baseline for a feasible optimized schedule; stage, review and approve it.
5. Select V-04A and evaluate impact: disconnecting the hospital is blocked. Select V-04B: the harbour branch loses about 12 m³/h but Sector 4 remains above 2 bar. Stage it; confirm that the current valve stays open until operator approval. Approve and execute **in simulation**.
6. Decision replay contains input, proposed action, deterministic checks, authorization and outcome. Refresh the browser to verify persistence. Reset retains history. Export the report for a complete JSON snapshot. Direct AI actuator access always returns 403.

## Engineering pipeline

`INGEST → VALIDATE → DETECT → SIMULATE → OPTIMIZE → ENFORCE SAFETY → REQUEST HUMAN APPROVAL → EXECUTE IN SIMULATION → AUDIT`

- `operations.py`: Pydantic requests, deterministic diagnostics, residual-based pipe ranking, schedule optimizer, safety and approval gateway.
- `hydraulics.py`: reproducible WNTR / EPANET 2.2 pressure-dependent distribution model. Stable nodes, seven pipe links, two controllable isolation links. Pipes use synthetic lengths, diameters, roughness and a 48 m head source. Customer demand totals 550 m³/h; the harbour branch is 12 m³/h within the 110 m³/h Sector 4 total. Leak loss is an emitter solved from pressure, not a forced output.
- `network.py`: process and distribution asset graph with attached sensor IDs. Graph disconnection and hydraulic consequences are explicitly distinguished. Pump failure closes the modeled supply link; there is no pump curve or transient model.
- `repository.py`: SQLite transactions locally; private Vercel Blob JSON documents with ETag compare-and-swap in production. Applied state, approval, outcome and audit commit together. Missing durable storage disables hosted operational writes; no serverless SQLite fallback.
- `services.py`: the three required service names: `read_network_telemetry`, `read_tariff_and_quality_feeds`, `stage_gated_valve_or_setpoint_action`. Reads cannot mutate. Staging cannot execute. No agent execution tool is exposed.
- `OperationsWorkspace.tsx`: Monitor / Investigate / Decide, connected incident queue, schematic twin, contextual inspector, evidence, Scenario Lab, impact evaluation, planning, approval and replay. The public story is explicitly a read-only narrative preview; public scrolling cannot change applied operational state.

The optimizer uses exact dynamic programming over 50 m³/h controls across ten hours. Storage: `next volume = volume + production − demand − solved loss`. Bounds: 100–800 m³/h production, 35–98% reserve in 10,000 m³, terminal reserve at least the starting reserve. Energy is `p × (2.64 + 120/p + 0.0011p)` kWh, tariffs $0.32 during 14:00–20:00 and $0.12 otherwise. The baseline is the applied schedule; savings can reflect both tariff shifts and a different terminal reserve. Infeasible optimization is omitted, not invented.

## Operational API

All `/api/ops/*` endpoints use JSON POSTs. Mutation requests require `scenario_id` and current `version`. Extra fields, unknown actions, invalid limits and nonfinite controls are rejected. No client-supplied safety verdict or arbitrary production vector is accepted.

| Endpoint | Behavior |
|---|---|
| create | Allocate an isolated durable synthetic scenario |
| read / feeds | Read authoritative telemetry / tariff and quality feeds |
| preview | Compare candidate and applied state, no write |
| event | Operator-only disruption, telemetry refresh, quarantine or reset |
| stage | Record server-derived action, input hash, evidence and checks; pending or blocked |
| decision | Operator authorization, freshness and safety revalidation, atomic simulated execution |
| actuate | Always 403; no physical adapter exists |

`/api/auth/login`, `/api/network`, `/api/desal` and read-only narrative APIs remain. Legacy stateless `/api/valves/stage` and `/approve` return 410 so there is one operational gateway.

At approval the server checks operator role, token signature/expiry, scenario version/epoch, pending status, ten-minute proposal lease and five-minute telemetry freshness, and recalculates all safety results. A new sample, reset or staged proposal invalidates prior pending actions. Concurrent approval has one winner. Failed execution rolls back approval and audit as well as state. Replay only inspects stored records.

## Deploy

Vercel builds Next.js and bundles the Python engine via `api/index.py`. `requirements.txt` installs WNTR, Pydantic and dependencies. Configure `AQUAGRID_SECRET` (server-only random signing key) and connect a **private Blob store**, which provides `BLOB_READ_WRITE_TOKEN`. These are never sent to the browser. Demo PINs can be overridden using `AQUAGRID_OPERATOR_PIN` and `AQUAGRID_ANALYST_PIN`.

## Validation and limits

The 47 automated tests include all three workflows, seven scenario classes, real EPANET mass balance, leak versus isolated sensor fault, optimizer feasibility, hospital isolation rejection, reserve and quality guards, analyst/forged-token denial, stale state, reset invalidation, concurrent duplicate approval, persistence and execution rollback. Browser verification covers incident selection, valve preview/staging/approval/replay, scheduling and responsive layout. See `VERIFICATION.md` for deployment results.

This is a production-inspired MVP, **not a live utility control system**. Measurements, geometry and forecasts are synthetic and uncalibrated. No LLM provider is connected: the analyst is deterministic and cannot actuate. There is no water-quality transport, transient hydraulics, real SCADA, institutional identity provider, tamper-proof ledger or regulatory certification. Audit is durable application history, not cryptographic immutability. Rooms use unguessable identifiers; demo accounts and room identifiers are not tenant-grade access control.

Architectural inspiration, without copied UI/code/assets: [Palantir operational apps](https://www.palantir.com/docs/foundry/app-building/operational-apps), [Bentley WaterSight](https://www.bentley.com/products/openflows-watersight/). Hydraulic reference: [EPA WNTR documentation](https://usepa.github.io/WNTR/hydraulics.html). Persistence: [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
