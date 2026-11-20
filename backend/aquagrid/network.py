"""Synthetic network topology and supply-connectivity analysis."""

from collections import deque

LAYERS = {
    1: {"key": "city", "name": "City and consumers"},
    2: {"key": "distribution", "name": "Distribution network"},
    3: {"key": "storage", "name": "Reservoir storage"},
    4: {"key": "desalination", "name": "Desalination production"},
    5: {"key": "intake", "name": "Coastal seawater intake"},
}

# id, name, type, layer, extra
ASSETS = [
    ("INT-01", "Offshore intake head", "intake", 5, {"depth_m": 9, "distance_offshore_m": 600}),
    ("IPS-01", "Intake pump station", "pump", 5, {"duty_pumps": 3}),
    ("CHL-01", "Chlorophyll-a probe", "sensor", 5, {"measures": "chlorophyll-a", "unit": "µg/L"}),
    ("TURB-01", "Intake turbidity", "sensor", 5, {"measures": "turbidity", "unit": "NTU"}),
    ("PT-01", "Pretreatment (DAF + dual-media filters)", "pretreatment", 4, {}),
    ("SDI-01", "RO feed silt density index", "sensor", 4, {"measures": "SDI15", "unit": ""}),
    ("HPP-01", "High-pressure pumps", "pump", 4, {"discharge_bar": 64}),
    ("RO-01", "RO train 1", "membrane", 4, {"vessels": 24, "elements_per_vessel": 7}),
    ("RO-02", "RO train 2", "membrane", 4, {"vessels": 24, "elements_per_vessel": 7}),
    ("ERD-01", "Isobaric energy recovery", "erd", 4, {"efficiency": 0.96}),
    ("COND-01", "Product conductivity", "sensor", 4, {"measures": "conductivity", "unit": "µS/cm"}),
    ("RES-01", "North reservoir", "reservoir", 3, {"capacity_m3": 3000}),
    ("RES-02", "Central reservoir", "reservoir", 3, {"capacity_m3": 4000}),
    ("RES-03", "South reservoir", "reservoir", 3, {"capacity_m3": 3000}),
    ("PS-01", "Transmission pumping station", "pump", 2, {"duty_pumps": 2}),
    ("FM-PS", "Pumping station flow meter", "sensor", 2, {"measures": "flow", "unit": "m³/h"}),
    ("V-04A", "Sector 4 inlet valve", "valve", 2, {"diameter_mm": 400}),
    ("V-04B", "Harbour branch isolation valve", "valve", 2, {"diameter_mm": 250}),
    ("V-02", "Sector 2 quality isolation valve", "valve", 2, {"diameter_mm": 250}),
    ("CL-S2", "Sector 2 chlorine residual", "sensor", 2, {"measures": "free chlorine", "unit": "mg/L"}),
    ("FM-S4", "Sector 4 inlet flow meter", "sensor", 2, {"measures": "flow", "unit": "m³/h"}),
    ("P-S3", "Sector 3 pressure", "sensor", 2, {"measures": "pressure", "unit": "bar"}),
    ("P-S4A", "Sector 4 pressure A (junction)", "sensor", 2, {"measures": "pressure", "unit": "bar"}),
    ("P-S4B", "Sector 4 pressure B (harbour)", "sensor", 2, {"measures": "pressure", "unit": "bar"}),
    ("SEC-01", "Sector 1 · North", "sector", 1, {"connections": 1900}),
    ("SEC-02", "Sector 2 · East", "sector", 1, {"connections": 2300}),
    ("SEC-03", "Sector 3 · Central", "sector", 1, {"connections": 2600}),
    ("SEC-04", "Sector 4 · Harbour", "sector", 1, {"connections": 2180, "critical": ["Al Noor Hospital"]}),
    ("BR-4H", "Harbour branch (Sector 4)", "branch", 1, {"connections": 140}),
    ("SEC-05", "Sector 5 · South", "sector", 1, {"connections": 1700}),
]

ASSET_INDEX = {a[0]: {"id": a[0], "name": a[1], "type": a[2], "layer": a[3], **a[4]} for a in ASSETS}

# Hydraulic links (from, to, nominal m3/h). Sensors are attached, not in-line.
EDGES = [
    ("INT-01", "IPS-01", 1250), ("IPS-01", "PT-01", 1250), ("PT-01", "HPP-01", 1250),
    ("HPP-01", "RO-01", 625), ("HPP-01", "RO-02", 625),
    ("RO-01", "RES-01", 200), ("RO-01", "RES-02", 100), ("RO-02", "RES-02", 100), ("RO-02", "RES-03", 200),
    ("RES-01", "PS-01", 180), ("RES-02", "PS-01", 190), ("RES-03", "PS-01", 180),
    ("PS-01", "SEC-01", 100), ("PS-01", "V-02", 120), ("V-02", "SEC-02", 120), ("PS-01", "SEC-03", 130),
    ("PS-01", "V-04A", 110), ("V-04A", "SEC-04", 110), ("SEC-04", "V-04B", 12), ("V-04B", "BR-4H", 12),
    ("PS-01", "SEC-05", 90),
]

SENSOR_ATTACHMENT = {
    "CHL-01": "INT-01", "TURB-01": "INT-01", "SDI-01": "HPP-01", "COND-01": "RO-01",
    "FM-PS": "PS-01", "FM-S4": "V-04A", "P-S3": "SEC-03", "P-S4A": "SEC-04", "P-S4B": "BR-4H", "CL-S2": "SEC-02",
}

CONTROLLABLE_VALVES = {"V-02", "V-04A", "V-04B"}
SUPPLY_SOURCES = ("RES-01", "RES-02", "RES-03")


def topology():
    return {
        "layers": [{"layer": k, **v} for k, v in LAYERS.items()],
        "assets": list(ASSET_INDEX.values()),
        "edges": [{"from": a, "to": b, "nominal_m3h": f} for a, b, f in EDGES],
        "sensor_attachment": SENSOR_ATTACHMENT,
        "controllable_valves": sorted(CONTROLLABLE_VALVES),
    }


def supplied_nodes(closed_valves):
    """Nodes reachable from storage when the given valves are closed."""
    closed = set(closed_valves)
    adjacency = {}
    for a, b, _ in EDGES:
        adjacency.setdefault(a, []).append(b)
    seen = set(SUPPLY_SOURCES)
    queue = deque(SUPPLY_SOURCES)
    while queue:
        node = queue.popleft()
        if node in closed:
            continue  # a closed valve receives water but passes none
        for nxt in adjacency.get(node, []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def isolation_impact(closed_valves):
    """Consumers that lose supply when the given valves are closed."""
    reachable = supplied_nodes(closed_valves)
    consumer_nodes = [a for a in ASSET_INDEX.values() if a["type"] in ("sector", "branch")]
    cut = [a for a in consumer_nodes if a["id"] not in reachable]
    # A sector that loses supply takes its child branch with it; count each once.
    connections = sum(a.get("connections", 0) for a in cut)
    critical = [c for a in cut for c in a.get("critical", [])]
    return {
        "isolated_nodes": [a["id"] for a in cut],
        "connections_without_supply": connections,
        "critical_facilities_without_supply": critical,
    }


def upstream_of(asset_id):
    parents = {}
    for a, b, _ in EDGES:
        parents.setdefault(b, []).append(a)
    start = SENSOR_ATTACHMENT.get(asset_id, asset_id)
    seen, queue = {start}, deque([start])
    while queue:
        for p in parents.get(queue.popleft(), []):
            if p not in seen:
                seen.add(p)
                queue.append(p)
    return sorted(seen)
