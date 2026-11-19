"""Small reproducible EPANET PDD distribution model; all geometry is synthetic."""
import functools
import os
import tempfile
os.environ.setdefault("MPLCONFIGDIR", "/tmp/aquagrid-mpl")

DEMANDS={'SEC-01':100,'SEC-02':120,'SEC-03':130,'SEC-04':98,'BR-4H':12,'SEC-05':90}
PIPES=[('P-TRUNK','RES-SUPPLY','J-MAIN',800,.45),
       ('P-01','J-MAIN','SEC-01',600,.25),('P-02','J-MAIN','SEC-02',700,.25),
       ('P-03','J-MAIN','SEC-03',900,.25),('V-04A','J-MAIN','SEC-04',900,.25),
       ('V-04B','SEC-04','BR-4H',550,.15),('P-05','J-MAIN','SEC-05',700,.25)]

@functools.lru_cache(maxsize=128)
def solve(leak=0.0,demand_factor=1.0,pump_failed=False,closed=()):
    import wntr
    wn=wntr.network.WaterNetworkModel()
    wn.options.time.duration=0
    wn.options.hydraulic.demand_model='PDD'
    wn.options.hydraulic.minimum_pressure=0
    wn.options.hydraulic.required_pressure=20
    wn.options.hydraulic.pressure_exponent=.5
    wn.add_reservoir('RES-SUPPLY',base_head=48)
    wn.add_junction('J-MAIN',base_demand=0,elevation=3)
    for node,demand in DEMANDS.items():
        wn.add_junction(node,base_demand=demand*demand_factor/3600,elevation=4)
    for pid,a,b,length,diameter in PIPES:
        wn.add_pipe(pid,a,b,length=length,diameter=diameter,roughness=120,
                    initial_status='CLOSED' if pid in closed or (pump_failed and pid=='P-TRUNK') else 'OPEN')
    # Leak as an emitter at the harbour node. Coefficient is a synthetic orifice;
    # actual loss is solved from local pressure, not forced to 65 m³/h.
    if leak>0: wn.get_node('BR-4H').emitter_coefficient=leak/3600/(30**.5)
    with tempfile.TemporaryDirectory(prefix='aquagrid-epanet-') as temp:
        result=wntr.sim.EpanetSimulator(wn).run_sim(file_prefix=os.path.join(temp,'network'))
    pressures={n:round(max(0,float(result.node['pressure'].iloc[0][n]))/10.1972,3) for n in DEMANDS}
    flows={p:round(float(result.link['flowrate'].iloc[0][p])*3600,3) for p,*_ in PIPES}
    # In EPANET emitter flow is included in node demand.
    total=float(result.node['demand'].iloc[0]['BR-4H'])*3600
    expected=DEMANDS['BR-4H']*demand_factor
    # Derive emitter flow via Q=C*sqrt(p); subtract from total for delivered customer demand.
    emitter=0
    if leak>0:
        emitter=(leak/(30**.5))*(max(0,float(result.node['pressure'].iloc[0]['BR-4H']))**.5)
    served={n:round(max(0,float(result.node['demand'].iloc[0][n])*3600-(emitter if n=='BR-4H' else 0)),3) for n in DEMANDS}
    expected_total=sum(DEMANDS.values())*demand_factor
    return {'solver':'WNTR / EPANET 2.2 PDD','pressure_bar':pressures,'pipe_flow_m3h':flows,
            'delivered_m3h':served,'expected_m3h':expected_total,
            'unserved_m3h':round(max(0,expected_total-sum(served.values())),3),
            'leak_m3h':round(max(0,emitter),3),
            'assumptions':['Synthetic lengths, diameters and 48 m supply head; not field calibrated.',
                           'Steady-state pressure-dependent demand; no transients or water-quality transport.',
                           'Pump failure closes the modeled supply link; no pump efficiency curve.']}

def from_config(cfg):
    return solve(float(cfg.get('leak',0)),float(cfg.get('demand_factor',1)),bool(cfg.get('pump_failed',False)),tuple(sorted(cfg.get('closed',[]))))
