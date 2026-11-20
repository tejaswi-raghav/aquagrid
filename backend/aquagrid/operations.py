"""Server-owned data-to-decision pipeline. No physical actuator bindings."""
import copy
import hashlib
import json
import math
import statistics
import time
import uuid
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field
from . import config as C,network,planning,scenario,security
from .hydraulics import from_config
from .repository import Repository,Conflict,Missing

class OpsError(Exception):
    def __init__(self,message,status=409):super().__init__(message);self.status=status
class Strict(BaseModel):model_config=ConfigDict(extra='forbid',allow_inf_nan=False,strict=True)
class Config(Strict):
    leak: float=Field(default=0,ge=0,le=180)
    pump_failed: bool=False
    sensor: Literal['healthy','flatline','drift']='healthy'
    demand_factor: float=Field(default=1,ge=.8,le=1.8)
    tariff_factor: float=Field(default=1,ge=1,le=3)
    quality_warning: bool=False
    closed: list[Literal['V-04A','V-04B']]=Field(default_factory=list,max_length=2)
class Command(Strict):
    scenario_id: str=Field(pattern='^[a-f0-9]{32}$')
    version: int=Field(ge=1)
    token: str=''
class Candidate(Command):
    config: Config
class ProposalRequest(Command):
    kind: Literal['valve','schedule','scenario']
    valve_id: Literal['V-04A','V-04B']|None=None
    plan: Literal['baseline','optimized','unsafe']='optimized'
    config: Config|None=None
class Decision(Command):
    proposal_id: str
    approve: bool=True
class Event(Command):
    operation: Literal['compound','reset','sample','quarantine']

COMPOUND=Config(leak=65,sensor='flatline',quality_warning=True).model_dump()

def event(doc,kind,data,actor='python'):
    doc['audit'].append({'id':len(doc['audit'])+1,'at':time.time(),'kind':kind,'actor':actor,'data':data})

def new_document():
    d={'id':uuid.uuid4().hex,'version':1,'epoch':uuid.uuid4().hex,'created_at':time.time(),'sampled_at':time.time(),
       'config':Config().model_dump(),'storage_pct':62.,'production':[600.]*10,'quarantined':[],
       'proposals':[],'audit':[],'outcomes':[]}
    event(d,'INGEST',{'dataset':'coastal-synthetic-v3','assumptions':'Not a real utility.'})
    return d

def diagnostic(cfg,hyd):
    ref=hyd['pressure_bar']['BR-4H'];baseline=from_config(Config().model_dump())['pressure_bar']['BR-4H']
    if cfg['sensor']=='flatline':raw=[baseline]*12
    elif cfg['sensor']=='drift':raw=[ref+.09*i for i in range(12)]
    else:raw=[ref+v for v in [0,.012,-.009,.008,-.004,.006,-.005,.011,-.003,.007,-.006,.002]]
    variance=statistics.pvariance(raw);bias=raw[-1]-ref;slope=(raw[-1]-raw[0])/11
    fault='FLATLINE' if variance<1e-7 else 'DRIFT' if abs(bias)>.4 and abs(slope)>.04 else 'HEALTHY'
    if any(not math.isfinite(v) or not 0<=v<=16 for v in raw):fault='IMPLAUSIBLE'
    return {'sensor_id':'P-S4B','classification':fault,'samples':raw,'variance':variance,'rate_of_change':slope,
            'independent_pressure_bar':ref,'difference_bar':bias,'units':'bar',
            'rule':'12-sample variance, range, slope and independent-junction residual.',
            'uncertainty':'Rule-based classification, not a calibrated probability. Transients and shared sensor faults can confound it.'}

def analysis(doc,config=None):
    cfg=copy.deepcopy(config or doc['config']);hyd=copy.deepcopy(from_config(cfg));diag=diagnostic(cfg,hyd)
    # Detect by boundary mass balance, independently of the injected fault flag.
    excess=max(0,hyd['pipe_flow_m3h']['P-TRUNK']-sum(hyd['delivered_m3h'].values()))
    reference=from_config({**cfg,'leak':0})
    pressure_drop=reference['pressure_bar']['BR-4H']-hyd['pressure_bar']['BR-4H']
    confirmed=excess>5 and pressure_drop>.05
    from .hydraulics import PIPES,DEMANDS
    adjacency={}
    for pid,a,b,*_ in PIPES:adjacency.setdefault(a,[]).append(b)
    def descendants(node):
        return [node]+[child for n in adjacency.get(node,[]) for child in descendants(n)]
    pipes=[]
    for pid,a,b,length,diameter in PIPES:
        downstream=descendants(b)
        served=sum(hyd['delivered_m3h'].get(n,0) for n in downstream)
        nominal=sum(DEMANDS.get(n,0)*cfg['demand_factor'] for n in downstream)
        residual=max(0,hyd['pipe_flow_m3h'][pid]-served)
        score=residual/max(1,nominal)
        pipes.append({'asset_id':pid,'from':a,'to':b,'score':round(score,4),
                      'reason':f'Flow balance residual {residual:.1f} m³/h across {nominal:.1f} m³/h downstream demand; normalized residual {score:.3f}.'})
    pipes.sort(key=lambda p:(-p['score'],p['asset_id']))
    for rank,p in enumerate(pipes,1):p['rank']=rank
    return {'hydraulics':hyd,'sensor':diag,'leak':{'confirmed':confirmed,'unexplained_m3h':excess,
            'classification':'CORROBORATED_SIMULATED_LEAK' if confirmed else 'NO_LEAK_EVIDENCE',
            'ranked_segments':sorted(pipes,key=lambda p:p['rank']) if confirmed else [],
            'maintenance':'Inspect harbour segment V-04B → BR-4H; verify acoustic and field evidence before repair.' if confirmed else 'No leak work order warranted by this model.',
            'rationale':f'Boundary mass-balance excess {excess:.1f} m³/h; independent harbour pressure depression {pressure_drop:.2f} bar. Ranking uses downstream normalized flow residual, not probabilities; faulty channel excluded.'},
            'measured_at':doc['sampled_at'],'assumptions':hyd['assumptions']}

def optimize(doc,cfg,hyd):
    # Exact dynamic programming on 50 m³/h controls with terminal reserve >= initial.
    target_demand=sum(hyd['delivered_m3h'].values());loss=hyd['leak_m3h']
    candidates={0:(0.,[])}
    for i in range(10):
        nxt={};tariff=C.tariff_at(14+i)*cfg['tariff_factor']
        for total,(cost,path) in candidates.items():
            for units in range(2,17):
                new=total+units
                level=doc['storage_pct']+(new*50-(i+1)*(target_demand+loss))/100
                if not 35<=level<=98:continue
                price=cost+units*50*C.specific_energy_kwh_m3(units*50)*tariff
                if new not in nxt or price<nxt[new][0]:nxt[new]=(price,path+[units*50])
        candidates=nxt
    eligible=[v for total,v in candidates.items() if total*50>=10*(target_demand+loss)]
    return min(eligible,key=lambda v:v[0])[1] if eligible else None

def schedule_result(doc,values,cfg,hyd):
    levels=[doc['storage_pct']];rows=[]
    for i,p in enumerate(values):
        demand=550*cfg['demand_factor'];loss=hyd['leak_m3h']
        withdrawal=sum(hyd['delivered_m3h'].values())
        levels.append(levels[-1]+(p-withdrawal-loss)/100)
        rows.append({'hour':f'{(14+i)%24:02}:00','production_m3h':p,'demand_m3h':demand,'loss_m3h':loss,'withdrawal_m3h':withdrawal,
                     'tariff':C.tariff_at(14+i)*cfg['tariff_factor'],'cost':p*C.specific_energy_kwh_m3(p)*C.tariff_at(14+i)*cfg['tariff_factor']})
    checks=[{'id':'reserve','passed':min(levels)>=35,'detail':f'Minimum {min(levels):.2f}% ≥ 35% floor'},
            {'id':'capacity','passed':max(levels)<=98,'detail':'Storage ≤ 98% capacity'},
            {'id':'production','passed':all(100<=p<=800 for p in values),'detail':'RO production in 100–800 m³/h envelope'},
            {'id':'quality','passed':not cfg['quality_warning'] or values==doc['production'],'detail':'Intake warning clear or production unchanged'},
            {'id':'service','passed':not cfg['pump_failed'] and hyd['unserved_m3h']<=15,'detail':'Transmission available and unserved demand ≤ 15 m³/h'},
            {'id':'terminal_reserve','passed':values==doc['production'] or levels[-1]>=doc['storage_pct'],'detail':f'New schedules must restore starting reserve ({doc["storage_pct"]:.1f}%) by midnight'}]
    return {'production':values,'levels':levels,'rows':rows,'minimum_pct':min(levels),'cost_usd':round(sum(r['cost'] for r in rows),2),
            'checks':checks,'eligible':all(c['passed'] for c in checks),
            'violation_hours':[rows[i]['hour'] for i,v in enumerate(levels[1:]) if v<35]}

def plans(doc):
    cfg=doc['config'];hyd=from_config(cfg)
    opt=optimize(doc,cfg,hyd)
    return {k:schedule_result(doc,p,cfg,hyd) for k,p in {'baseline':doc['production'],'optimized':opt,'unsafe':[100]*6+[600]*4}.items() if p is not None}

def candidate_result(doc,cfg):
    base=analysis(doc);candidate=analysis(doc,cfg)
    projection=schedule_result(doc,doc['production'],cfg,candidate['hydraulics'])
    return {'baseline':base,'candidate':candidate,'projection':projection,'graph_impact':network.isolation_impact(cfg['closed']),'valve_safety':validate_action(doc,{'kind':'valve','valve_id':next(iter(set(cfg['closed']) ^ set(doc['config']['closed'])), 'V-04B'),'target':'closed' if set(cfg['closed'])-set(doc['config']['closed']) else 'open'}) if set(cfg['closed']) != set(doc['config']['closed']) else None,'applied':False,
            'comparison':{'loss_change_m3h':candidate['hydraulics']['leak_m3h']-base['hydraulics']['leak_m3h'],
                          'unserved_change_m3h':candidate['hydraulics']['unserved_m3h']-base['hydraulics']['unserved_m3h']}}

def validate_action(doc,action):
    cfg=copy.deepcopy(doc['config']);before=analysis(doc)
    if action['kind']=='schedule':
        result=schedule_result(doc,action['production'],cfg,before['hydraulics'])
        return {'checks':result['checks'],'eligible':result['eligible'],'projection':result,'impact':before['hydraulics']}
    if action['kind']=='scenario':
        # Scenario lab injects faults only as an explicitly approved demo-state change.
        check={'id':'simulation_only','passed':True,'detail':'Approve synthetic fault injection only; no physical commands.'}
        candidate=candidate_result(doc,action['config'])
        return {'eligible':True,'checks':[check],'impact':candidate['candidate']['hydraulics'],'projection':candidate['projection']}
    valve=action['valve_id'];target=action['target']
    closed=set(cfg['closed'])
    if target=='closed':closed.add(valve)
    else:closed.discard(valve)
    cfg['closed']=sorted(closed);after=analysis(doc,cfg)
    graph=network.isolation_impact(closed)
    checks=[{'id':'evidence','passed':before['leak']['confirmed'] or target=='open','detail':'Independent leak evidence must justify isolation'},
            {'id':'critical_supply','passed':not graph['critical_facilities_without_supply'],'detail':'No critical facility loses graph connectivity'},
            {'id':'pressure','passed':after['hydraulics']['pressure_bar']['SEC-04']>=2,'detail':'EPANET Sector 4 pressure ≥ 2 bar'},
            {'id':'service','passed':after['hydraulics']['unserved_m3h']<=15,'detail':'Modeled interruption ≤ 15 m³/h; harbour branch includes 12 m³/h'},
            {'id':'changed','passed':(valve in doc['config']['closed'])!=(target=='closed'),'detail':'Requested state differs from current valve state'}]
    projection=schedule_result(doc,doc['production'],cfg,after['hydraulics'])
    checks+=projection['checks'][:3]
    return {'eligible':all(c['passed'] for c in checks),'checks':checks,'impact':after['hydraulics'],
            'graph_impact':graph,'projection':projection,'before':before['hydraulics'],
            'distinction':'Connectivity is graph reachability. Pressures and delivered demand come from EPANET PDD; not a calibrated utility model.'}

class Operations:
    def __init__(self,repository=None):self.repo=repository or Repository()
    def create(self):
        from_config(Config().model_dump())  # Validate solver availability before allocating storage.
        return self.repo.create(new_document())
    def create_story(self):
        d=new_document();d['config']=copy.deepcopy(COMPOUND);d['quarantined']=['P-S4B']
        analysis(d)  # Validate the seeded model before allocating a new document.
        event(d,'INGEST',{'dataset':'coastal-synthetic-v3-compound','source':'inline story initialization'})
        return self.enrich(self.repo.create(d))
    def read_network_telemetry(self,id):
        doc=self.repo.read(id);return self.enrich(doc)
    def read_tariff_and_quality_feeds(self,id):
        doc=self.repo.read(id)
        return {'tariffs':[C.tariff_at(14+i)*doc['config']['tariff_factor'] for i in range(10)],
                'demand_m3h':550*doc['config']['demand_factor'],'quality_warning':doc['config']['quality_warning'],'sampled_at':doc['sampled_at']}
    def enrich(self,doc):
        out=copy.deepcopy(doc);evidence=analysis(doc);out['evidence']=evidence;out['plans']=plans(doc);out['topology']=network.topology()
        # Explicit junction/pipe objects extend the shared graph, with stable IDs.
        out['topology']['hydraulic_assets']=[{'id':p,'type':'pipe','from':a,'to':b,'length_m':l,'diameter_m':d} for p,a,b,l,d in __import__('aquagrid.hydraulics',fromlist=['PIPES']).PIPES]+[{'id':'J-MAIN','type':'junction'},{'id':'RES-SUPPLY','type':'reservoir'}]
        ctx=scenario.Context(1,doc['quarantined'])
        state=scenario.build_state(ctx)
        state['quarantined']=doc['quarantined'];state['quality_review_open']=doc['config']['quality_warning']
        state['leak']={'active':evidence['leak']['confirmed'],'modelled_loss_m3h':evidence['hydraulics']['leak_m3h'],'isolated':'V-04B' in doc['config']['closed'],'location':'V-04B → BR-4H' if evidence['leak']['confirmed'] else None}
        state['valves']={v:{'position':'closed' if v in doc['config']['closed'] else 'open'} for v in network.CONTROLLABLE_VALVES}
        state['demand_m3h']=550*doc['config']['demand_factor'];state['storage']['pct']=doc['storage_pct'];state['storage']['volume_m3']=doc['storage_pct']*100
        for tank in state['storage']['tanks']:tank['pct']=doc['storage_pct']
        p=doc['production'][0];sec=C.specific_energy_kwh_m3(p)
        state['production'].update(m3h=p,feed_m3h=p/C.RECOVERY,sec_kwh_m3=sec,power_kw=p*sec,cost_per_hour_usd=p*sec*C.tariff_at(14)*doc['config']['tariff_factor']);state['tariff']['current_usd_kwh']=C.tariff_at(14)*doc['config']['tariff_factor']
        sensor_node={'P-S3':'SEC-03','P-S4A':'SEC-04','P-S4B':'BR-4H'}
        for sid,n in sensor_node.items():
            val=evidence['hydraulics']['pressure_bar'][n]
            if sid=='P-S4B':vals=evidence['sensor']['samples'];val=vals[-1]
            else:vals=[val+x for x in [.01,-.01,.02,0,-.02,.01,0,.01,-.01,.02,0,0]]
            state['sensors'][sid].update(value=val,series=[{'t':f'-{11-i}m','v':v} for i,v in enumerate(vals)],status='quarantined' if sid in doc['quarantined'] else 'flatline' if sid=='P-S4B' and evidence['sensor']['classification']!='HEALTHY' else 'normal')
        for sid,val in [('FM-S4',max(0,evidence['hydraulics']['pipe_flow_m3h']['V-04A'])),('FM-PS',max(0,evidence['hydraulics']['pipe_flow_m3h']['P-TRUNK']))]:
            state['sensors'][sid].update(value=val,series=[{'t':f'-{11-i}m','v':val} for i in range(12)])
        state['asset_status'].update({v:'closed' if v in doc['config']['closed'] else 'normal' for v in network.CONTROLLABLE_VALVES})
        state['asset_status']['BR-4H']='isolated' if 'V-04B' in doc['config']['closed'] else 'critical' if evidence['leak']['confirmed'] else 'normal'
        for sid,value in [('CHL-01',28. if doc['config']['quality_warning'] else 6.),('TURB-01',3.2 if doc['config']['quality_warning'] else .5)]:
            state['sensors'][sid].update(value=value,status='warning' if doc['config']['quality_warning'] else 'normal',series=[{'t':f'-{11-i}m','v':value} for i in range(12)])
        state['asset_status']['INT-01']='warning' if doc['config']['quality_warning'] else 'normal'
        state['asset_status']['SEC-04']='critical' if evidence['leak']['confirmed'] else 'normal'
        state['asset_status']['PS-01']='critical' if doc['config']['pump_failed'] else 'normal'
        state['alerts']=[]
        if evidence['leak']['confirmed']:state['alerts'].append({'id':'leak','title':'Harbour flow imbalance','severity':'critical','assets':['V-04B','BR-4H','P-S4A'],'raised_at':'14:00','detail':f"Solved loss {evidence['hydraulics']['leak_m3h']:.1f} m³/h; corroborated pressure and flow."})
        if evidence['sensor']['classification']!='HEALTHY':state['alerts'].append({'id':'sensor','title':evidence['sensor']['classification']+' · P-S4B','severity':'warning','assets':['P-S4B'],'raised_at':'14:00','detail':'Do not use this channel as sole action evidence.'})
        if doc['config']['quality_warning']:state['alerts'].append({'id':'quality','title':'Intake-quality warning','severity':'warning','assets':['INT-01'],'raised_at':'14:00','detail':'Production changes are blocked pending quality resolution.'})
        if doc['config']['pump_failed']:state['alerts'].append({'id':'pump','title':'Transmission pump unavailable','severity':'critical','assets':['PS-01'],'raised_at':'14:00','detail':'Supply-link outage; inspect solved delivered demand.'})
        state['flows']=[{'from':a,'to':b,'m3h':float(f)} for a,b,f in network.EDGES]
        for f in state['flows']:
            match=next((pid for pid,a,b,*_ in __import__('aquagrid.hydraulics',fromlist=['PIPES']).PIPES if (a,b)==(f['from'],f['to'])),None)
            if match:f['m3h']=evidence['hydraulics']['pipe_flow_m3h'][match]
            if f['from']=='INT-01' or f['from']=='IPS-01' or f['from']=='PT-01':f['m3h']=p/C.RECOVERY
            if f['from']=='HPP-01':f['m3h']=p/C.RECOVERY/2
            if f['from'].startswith('RO-'):f['m3h']=p*(1/3 if f['to']!='RES-02' else 1/6)
            if f['from'].startswith('RES-'):f['m3h']=evidence['hydraulics']['pipe_flow_m3h']['P-TRUNK']*f['m3h']/550
            if f['from']=='PS-01' and f['to'].startswith('SEC-'):f['m3h']=evidence['hydraulics']['delivered_m3h'][f['to']]
            if f['from']=='V-04B' or (f['from']=='SEC-04' and f['to']=='V-04B'):f['m3h']=evidence['hydraulics']['pipe_flow_m3h']['V-04B']
            if (f['from']=='PS-01' and f['to']=='V-04A') or f['from']=='V-04A':f['m3h']=evidence['hydraulics']['pipe_flow_m3h']['V-04A']
            if doc['config']['pump_failed'] and f['from']=='PS-01':f['m3h']=0
        for sid in state['sensors']:state['asset_status'][sid]=state['sensors'][sid]['status']
        out['state']=state;out['storage_backend']='private-blob-cas' if self.repo.token else 'sqlite'
        return out
    def preview(self,body):
        doc=self.repo.read(body.scenario_id)
        if doc['version']!=body.version:raise Conflict('Scenario changed')
        return candidate_result(doc,body.config.model_dump())
    def event(self,body):
        op=security.require_approver(body.token)
        def apply(d):
            if body.operation=='reset':
                d.update(config=Config().model_dump(),production=[600.]*10,storage_pct=62.,quarantined=[],epoch=uuid.uuid4().hex)
            elif body.operation=='compound':
                d['config']=copy.deepcopy(COMPOUND);d['quarantined']=['P-S4B']
            elif body.operation=='quarantine':
                if analysis(d)['sensor']['classification']=='HEALTHY':raise OpsError('No faulty signal to quarantine')
                d['quarantined']=['P-S4B']
            d['sampled_at']=time.time()
            for p in d['proposals']:
                if p['status']=='PENDING_APPROVAL':p['status']='EXPIRED'
            event(d,'INGEST' if body.operation=='sample' else body.operation.upper(),{'operation':body.operation,'config':d['config']},op['sub'])
        doc,_=self.repo.mutate(body.scenario_id,body.version,apply);return self.enrich(doc)
    def stage_gated_valve_or_setpoint_action(self,body):
        def apply(d):
            if body.kind=='schedule':
                options=plans(d)
                if body.plan not in options:raise OpsError('No feasible optimizer result')
                action={'kind':'schedule','production':options[body.plan]['production'],'plan':body.plan}
            elif body.kind=='scenario':
                if not body.config:raise OpsError('Candidate configuration is required',400)
                action={'kind':'scenario','config':body.config.model_dump()}
            else:
                if not body.valve_id:raise OpsError('Select a valve',400)
                action={'kind':'valve','valve_id':body.valve_id,'target':'open' if body.valve_id in d['config']['closed'] else 'closed'}
            safety=validate_action(d,action)
            evidence=analysis(d)
            event(d,'VALIDATE',{'sensor':evidence['sensor']['classification'],'quarantined':d['quarantined']})
            event(d,'DETECT',{'conclusion':evidence['leak']})
            event(d,'SIMULATE',{'solver':safety['impact']['solver'],'impact':safety['impact']})
            if action['kind']=='schedule':event(d,'OPTIMIZE',{'plan':action['plan'],'cost_usd':safety['projection']['cost_usd']})
            event(d,'ENFORCE_SAFETY',{'eligible':safety['eligible'],'checks':safety['checks']})
            p={'id':uuid.uuid4().hex,'status':'PENDING_APPROVAL' if safety['eligible'] else 'BLOCKED_BY_SAFETY',
               'action':action,'safety':safety,'input':copy.deepcopy({k:d[k] for k in ['config','production','storage_pct','quarantined','sampled_at','epoch']}),
               'evidence':analysis(d),'created_at':time.time(),'expires_at':time.time()+600,'version':1,'state_version':d['version']+1,'epoch':d['epoch'],'author':'deterministic analyst'}
            p['input_sha256']=hashlib.sha256(json.dumps(p['input'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
            # New staging invalidates old leases, but never executes physical state.
            for old in d['proposals']:
                if old['status']=='PENDING_APPROVAL':old['status']='EXPIRED'
            d['proposals'].append(p);event(d,'REQUEST_HUMAN_APPROVAL' if safety['eligible'] else 'ENFORCE_SAFETY',{'proposal':p['id'],'safety':safety})
        doc,_=self.repo.mutate(body.scenario_id,body.version,apply);return self.enrich(doc)
    def decide(self,body):
        op=security.require_approver(body.token)
        def apply(d):
            p=next((p for p in d['proposals'] if p['id']==body.proposal_id),None)
            if not p:raise Missing('Proposal not found')
            if p['status']!='PENDING_APPROVAL':raise OpsError('Proposal already resolved or blocked')
            if p['state_version']!=d['version'] or p['epoch']!=d['epoch'] or time.time()>p['expires_at'] or time.time()-d['sampled_at']>300:
                p['status']='EXPIRED';event(d,'EXPIRED',{'proposal':p['id']},op['sub']);return
            if not body.approve:p['status']='REJECTED';event(d,'REJECTED',{'proposal':p['id']},op['sub']);return
            safety=validate_action(d,p['action']);p['safety']=safety
            if not safety['eligible']:p['status']='BLOCKED_BY_SAFETY';event(d,'ENFORCE_SAFETY',{'proposal':p['id'],'checks':safety['checks']});return
            event(d,'HUMAN_AUTHORIZATION',{'proposal':p['id'],'approver':op['sub']},op['sub'])
            action=p['action']
            if action['kind']=='valve':
                closed=set(d['config']['closed'])
                if action['target']=='closed':closed.add(action['valve_id'])
                else:closed.discard(action['valve_id'])
                d['config']['closed']=sorted(closed)
            elif action['kind']=='schedule':d['production']=action['production']
            else:d['config']=action['config'];d['quarantined']=[]
            # Any exception before repository commit rolls back state, approval and audit together.
            if os.getenv('AQUAGRID_TEST_FAIL_EXECUTION')=='1':raise RuntimeError('Injected execution failure')
            p['status']='EXECUTED_IN_SIMULATION';p['approver']=op['sub'];p['executed_at']=time.time();p['version']+=1
            p['outcome']=analysis(d);d['outcomes'].append({'proposal':p['id'],'at':time.time(),'config':copy.deepcopy(d['config']),'production':list(d['production']),'evidence':p['outcome']})
            event(d,'EXECUTE_IN_SIMULATION',{'proposal':p['id'],'outcome':p['outcome']},op['sub'])
        import os
        doc,_=self.repo.mutate(body.scenario_id,body.version,apply);return self.enrich(doc)
