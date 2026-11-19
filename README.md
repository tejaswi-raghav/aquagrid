# AquaGrid functional local MVP

A FastAPI + SQLite water-network simulation with an interactive infrastructure explorer and operator command centre. All assets, tariffs, sensor streams, and policies are synthetic. No hardware or PLC connections.

## Start

Requires Python 3.11+ and network access on first installation.

```sh
./scripts/run.sh
```

The script creates a local virtual environment, installs runtime dependencies if needed, asks you to choose an operator password, and serves **http://127.0.0.1:8000**. Enter the control centre and click **Operator sign in / out** to authenticate with that password. Read-only exploration does not need login.

Alternatively:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
export AQUAGRID_OPERATOR_PASSWORD='choose-your-own-local-password'
.venv/bin/uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

API schema: http://127.0.0.1:8000/docs. The default database is `data/aquagrid.sqlite`; override with `AQUAGRID_DB`. Database files and environments are excluded from Git. Stop with Ctrl-C. Restarting preserves simulation state and history; scenario reset preserves audit records and expires pending proposals.

## Four-minute demonstration

1. Sign in as demo operator. Reset to baseline if necessary.
2. In Energy planning, compare **Optimize tariffs** with the baseline. Stage a schedule, review its constraints, and approve it to demonstrate a plant schedule change. Reset before the disruption demonstration.
3. Run **14:00 disruption**. Python injects the leak, sensor flatline and bloom warning; it detects the faulty signal and automatically quarantines Q-01.
4. Sensor diagnostics shows raw samples, computed variance and independent Sector 4 pressure/inflow evidence.
5. Energy planning → Aggressive throttle → Stage selected plan. Observe `BLOCKED_BY_SAFETY`, a 30.8% minimum reserve, and the separate quality block. The tariff optimizer can calculate a feasible reserve schedule, but it cannot clear the quality gate.
6. Incident centre → Test unauthorized valve command. The server returns HTTP 403 and writes the denial to the audit table.
7. Sample telemetry if the demo has been open for over five minutes. Stage safe isolation, then Control approvals → Review approval → Approve and execute. This closes V-04 in the simulator and activates the separately modeled bypass. Loss falls to zero; Sector 4 demand is maintained. The bloom warning stays unresolved.
8. Reload: state and history persist. Export report to download the complete latest snapshot, proposals, sensor evidence, projections and audit records.

## Tests

```sh
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest backend/tests -q
```

The suite verifies read/write separation, authentication, flatline/drift/implausible signal classification, leak evidence, reserve/quality precedence, schedule feasibility/costs, proposal expiry and versions, reset/persistence, audit immutability, concurrent duplicate approvals, and valid simulated execution. No external AI API or model weights required.

## Engineering limits

This is a functional supervised simulation MVP, not an operational water utility controller. The model uses aggregate hourly mass balance and synthetic pressure signatures; it does not solve EPANET/WNTR hydraulics, pressure transients, water chemistry, plant ramp limits or pump efficiency. See `docs/ARCHITECTURE.md` and `docs/SAFETY.md`.

The existing public Vercel site still serves the earlier browser demonstration. This backend revision is intended for local use or a single persistent server with a durable volume. Do not put the SQLite file on an ephemeral Vercel filesystem. A cloud release requires durable database/storage provisioning and production authentication. The included Dockerfile supports a persistent-server deployment; it has not been deployed to a hosted backend in this session.

## Visual assets

Original procedural SVG infrastructure geometry and icons. Fonts: Manrope, DM Sans and IBM Plex Mono via Google Fonts, with system fallbacks. No stock photography or licensed 3D models required.
