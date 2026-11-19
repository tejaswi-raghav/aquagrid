# Simulation safety boundaries

No controller SDK, network protocol or credentials for physical hardware are present. All actuator changes occur in the local SQLite simulation state.

1. Read routes do not modify operational state. Agent staging cannot select proposal status, authorize itself, or modify policies.
2. An authenticated demo operator must approve every simulated schedule or isolation. Direct actuator endpoints always deny requests, including authenticated operator requests.
3. Schedule validation enforces eight finite setpoints between 0 and 800 m³/h, the 35% aggregate reserve floor, storage capacity, telemetry freshness and water-quality status. Unknown action kinds and extra request fields are rejected.
4. Bloom warning, quarantine or unhealthy quality diagnostics block production changes. The UI cannot clear these through an approval. Protective leak isolation is the only separate action and requires independent evidence plus the preconfigured bypass service model.
5. Sensor diagnostics classify insufficient data, out-of-range/nonfinite readings, flatlining and drift against a reference. Runtime scenario injects the flatline, and quarantines it automatically; drift and implausible cases are covered by tests.
6. Proposals expire after 300 seconds. Any sampled state/version change or reset invalidates an earlier pending approval. Execution rechecks safety inside the write transaction. Stale, duplicate and concurrent requests cannot produce a second execution.
7. Audit triggers reject UPDATE and DELETE. Audit is not cryptographically tamper-proof: an administrator with database filesystem access could alter schema/files. Reset preserves audit entries and proposal history.

Hard-coded demo policies are educational assumptions, not engineering operating limits. There is no certified hydraulic, quality or industrial safety validation. No live weather/algal forecast feed is consumed; the bloom warning is a named synthetic scenario event.
