# AquaGrid operational upgrade

## Audit
- Current Next.js site: multiple 3D canvases with HTML labels competing with narrative overlays.
- Python validates synthetic signals, schedule comparisons, and signed valve records, but has no durable operational state or execution ledger. Context is browser supplied; duplicate approvals can be replayed.
- No dedicated /plant route, real constrained optimizer, scenario lab, or persistent decision replay.

## Architecture
- Retain public cinematic React/R3F site and original AquaGrid logo; use latest requested industrial palette in /control.
- /plant hosts the existing six-stage process explorer; navigation has only /, /plant, /control.
- Add typed Python operational requests and typed TypeScript responses, asset graph, deterministic sensor diagnostics, constrained production optimization, scenario candidates, persistent proposals and evidence.
- Local SQLite uses atomic transactions. Hosted private Blob uses ETag compare-and-swap for an isolated scenario document; no filesystem database on Vercel.
- WNTR/EPANET runs an explicitly synthetic distribution model; graph connectivity, illustrative legacy values, and solved hydraulics are labeled separately.
- The three required service interfaces delegate to read-only snapshots/feeds or the single staging gateway. HMAC operator authentication is retained; privileged execution is server-only.

## Build order
1. Resolve labels through fixed UI rails and progressive disclosure.
2. Persistence adapter, scenarios, evidence, safety and execution ledger.
3. Hydraulic comparisons and constrained optimizer.
4. Monitor / Investigate / Decide workspace with lab, evidence and replay.
5. Tests, build, browser verification and deployment.

## Acceptance
- Read tools cannot mutate state; candidate simulation never commits authoritative changes.
- Leak and sensor fault can coexist; evidence contains timestamps, quality, assumptions and limits.
- Reserve/quality guards block unsafe schedules; valve impacts show disconnected areas and actual solver provenance.
- Human authorization, freshness/version checks, duplicate protection and rollback are enforced atomically.
- Scenario events include leak, pump failure, flatline, drift, demand spike, tariff increase and quality warning.
- Three workflows have working API and browser paths; decisions persist and replay from recorded input snapshots.
