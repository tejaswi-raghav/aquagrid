# Architecture

The same FastAPI origin serves static HTML/SVG/JS and `/api` routes. `dist/app.js` handles geometry and navigation. `dist/backend.js` fetches authoritative state and sends typed proposal/decision requests. It provides no browser-state mutation fallback when the API is unavailable.

`backend/core.py` contains deterministic sensor checks, hourly volume projections, the discrete tariff optimizer, safety validation, and the SQLite store. `backend/main.py` validates HTTP requests and separates public read/staging routes from operator-authenticated scenario and approval routes.

SQLite transactions serialize write decisions with `BEGIN IMMEDIATE`. A proposal records its scenario epoch, state version, own version and five-minute expiry. Approval checks all of these plus telemetry age before atomically persisting asset changes and the execution audit record. A second concurrent approval cannot execute the same proposal twice. Reads return new JSON values and cannot modify stored telemetry.

## Model and units

- Combined storage: 10,000 m³; initial 6,200 m³ (62%); aggregate safety floor 3,500 m³ (35%). Individual reservoirs are schematic representations of this combined balance, not independently solved tanks.
- Two plants: 300 m³/h each at baseline; combined scheduling capacity 0–800 m³/h. Feed-to-product ratio is 0.48, with reject outside the potable distribution schematic.
- Demand: 550 m³/h. Sector 4 demand: 110 m³/h; disruption inflow 175 m³/h, hence 65 m³/h loss. Pressure changes from illustrative 3.8 bar to 1.7 bar.
- Protective isolation removes the leaking branch and routes 110 m³/h through an explicitly assumed 150 m³/h bypass. This contingency is not an inferred hydraulic result.
- Each hourly projection adds production and subtracts demand plus loss. Storage remains a current snapshot; the eight-hour schedule is a projection, not an automatically ticking live process.
- Energy: 3.5 kWh/m³; illustrative USD peak tariff $0.32/kWh from 14–18h and off-peak $0.12/kWh from 18–22h.
- Optimizer: exact dynamic programming over eight hourly controls on 100 m³/h steps, 0–800 bounds, reserve and capacity constraints, and terminal storage at least initial storage. Returns the cheapest schedule within that discrete model. Water-quality eligibility is evaluated separately; optimization never grants authorization.

## Data and operations

The topology is seeded from `backend/topology.json`. Server responses adjust edge flows for production, loss and bypass state. Quality samples and scenario state are reproducible. The snapshot contains 200 most recent audit events, while the database retains the complete history.

Sessions store SHA-256 digests of opaque random bearer tokens and expire after one hour. The operator password comes only from the environment; no default runtime password is shipped. Browser tokens live in sessionStorage. This is a loopback demo identity system; production requires managed identities, TLS, rate limiting, access isolation and secret management.

API routes:

- GET `/api/health`, `/api/telemetry`, `/api/feeds`, `/api/brief`
- POST `/api/auth/login`
- POST `/api/scenario/reset|disrupt|sample|quarantine` (operator)
- POST `/api/proposals` (agent staging only)
- POST `/api/proposals/{id}/decision` (operator)
- POST `/api/actuators/{asset}` (always denied and audited)

The agent decision brief is a deterministic fallback with auditable observations; it is not an LLM output or fabricated reasoning trace.
