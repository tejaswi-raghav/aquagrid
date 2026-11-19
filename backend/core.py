"""Deterministic educational model. No physical controller integrations."""
import copy
from pathlib import Path
import hashlib
import json
import math
import secrets
import sqlite3
import statistics
import time
import uuid
from contextlib import contextmanager

FLOOR = 35.0
CAPACITY = 10000.0
FRESHNESS = 300
TTL = 300
DEMAND = 550
TARIFFS = [.32] * 4 + [.12] * 4
PLANS = {'baseline': [600]*8, 'shift': [400]*4+[800]*4,
         'unsafe': [100]*6+[600]*2}

def diagnose(samples, reference=None, low=0, high=20):
    if len(samples) < 8:
        return {'classification': 'INSUFFICIENT_DATA', 'variance': None}
    if any(not math.isfinite(x) or x < low or x > high for x in samples):
        return {'classification': 'IMPLAUSIBLE', 'variance': None}
    variance = statistics.pvariance(samples)
    trend = (samples[-1]-samples[0])/(len(samples)-1)
    kind = 'HEALTHY'
    if variance < .000001:
        kind = 'FLATLINE'
    elif reference and all(abs(x-y) > .25 for x,y in zip(samples[-3:], reference[-3:])) and abs(trend) > .03:
        kind = 'DRIFT'
    return {'classification': kind, 'variance': variance, 'rate_of_change': trend}

def baseline():
    return {'epoch': str(uuid.uuid4()), 'version': 1, 'hour': 13,
            'disrupted': False, 'quality_alert': False, 'quarantined': False,
            'sampled_at': time.time(), 'storage_pct': 62.0,
            'production': [600]*8, 'valve': 'OPEN', 'demand': DEMAND,
            'loss': 0, 'pressure_s4': 3.8, 'flow_s4': 110,
            'quality_samples': [.4,.44,.41,.48,.42,.43,.46,.41]}

def project(state, production):
    levels = [state['storage_pct']]
    for value in production:
        levels.append(levels[-1]+(value-DEMAND-state['loss'])/100)
    return {'production': production, 'levels': levels, 'min': min(levels),
            'cost': sum(v*3.5*t for v,t in zip(production,TARIFFS)),
            'violations': [14+i for i,v in enumerate(levels[1:]) if v < FLOOR or v > 100]}

def validation(state, action, now=None):
    now = time.time() if now is None else now
    reasons = []
    if now-state['sampled_at'] > FRESHNESS:
        reasons.append('Telemetry is older than 300 seconds; sample the simulation again.')
    if action['kind'] == 'schedule':
        result = project(state, action['production'])
        if result['min'] < FLOOR: reasons.append('Projected reserve falls below 35%.')
        if max(result['levels']) > 100: reasons.append('Projected storage exceeds capacity.')
        if state['quality_alert'] or state['quarantined'] or diagnose(state['quality_samples'])['classification'] != 'HEALTHY':
            reasons.append('Water quality is unresolved; production changes are blocked.')
        return {'passed': not reasons, 'reasons': reasons, 'projection': result}
    if action['kind'] == 'isolate':
        if state['valve'] != 'OPEN': reasons.append('Valve is already closed.')
        if not leak_evidence(state)['confirmed']: reasons.append('Independent leak evidence is absent.')
        # Explicit simplified contingency: a separate 150 m³/h bypass feeds 110 m³/h demand.
        if 150 < 110: reasons.append('Bypass cannot maintain sector service.')
        check = copy.deepcopy(state); check['loss'] = 0
        result = project(check, state['production'])
        if result['min'] < FLOOR: reasons.append('Post-isolation reserve violates floor.')
        return {'passed': not reasons, 'reasons': reasons, 'projection': result,
                'service_model': '150 m³/h bypass supplies 110 m³/h Sector 4 demand; no hydraulic solver.'}
    raise ValueError('Unsupported action')

def leak_evidence(s):
    excess = s['flow_s4']-110
    return {'confirmed': s['pressure_s4'] < 2.5 and excess > 30,
            'pressure_bar': s['pressure_s4'], 'inflow_m3h': s['flow_s4'],
            'expected_demand_m3h': 110, 'excess_m3h': excess,
            'classification': 'CONFIRMED_SIMULATED_LEAK' if s['pressure_s4'] < 2.5 and excess > 30 else 'NO_LEAK_EVIDENCE'}

def optimize(state):
    """Exact DP on 100 m³/h steps; restores initial volume by 22:00."""
    candidates={0:(0.0,[])}
    for hour,tariff in enumerate(TARIFFS):
        next_states={}
        for total,(cost,path) in candidates.items():
            for units in range(9):
                produced=total+units
                volume=state['storage_pct']*100+produced*100-(hour+1)*(DEMAND+state['loss'])
                if not FLOOR*100<=volume<=CAPACITY: continue
                candidate=cost+units*100*3.5*tariff
                if produced not in next_states or candidate<next_states[produced][0]:
                    next_states[produced]=(candidate,path+[units*100])
        candidates=next_states
    eligible=[v for total,v in candidates.items() if total*100>=8*(DEMAND+state['loss'])]
    if not eligible: return None
    return min(eligible,key=lambda x:x[0])[1]

class Problem(Exception):
    def __init__(self, status, detail): self.status, self.detail = status, detail

class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.db() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
            CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
            ''')
            if not c.execute('SELECT 1 FROM state').fetchone():
                self.save(c,baseline()); self.log(c,'system','initialized',{'mode':'synthetic'})

    @contextmanager
    def db(self):
        c=sqlite3.connect(self.path, timeout=10)
        try:
            c.execute('PRAGMA busy_timeout=10000'); c.execute('BEGIN IMMEDIATE')
            yield c
            c.commit()
        except Exception:
            c.rollback(); raise
        finally: c.close()
    def state(self,c): return json.loads(c.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
    def save(self,c,s): c.execute('INSERT OR REPLACE INTO state VALUES(1,?)',(json.dumps(s),))
    def log(self,c,actor,event,body): c.execute('INSERT INTO audit(at,actor,event,body) VALUES(?,?,?,?)',(time.time(),actor,event,json.dumps(body)))
    def login(self):
        token=secrets.token_urlsafe(32)
        with self.db() as c:
            c.execute('DELETE FROM sessions WHERE expires < ?',(time.time(),))
            c.execute('INSERT INTO sessions VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(),time.time()+3600))
            self.log(c,'operator','login',{})
        return token
    def authenticated(self,token):
        with self.db() as c:
            return bool(c.execute('SELECT 1 FROM sessions WHERE digest=? AND expires>?',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone())
    def snapshot(self):
        with self.db() as c:
            s=self.state(c)
            proposals=[json.loads(r[0]) for r in c.execute('SELECT body FROM proposals ORDER BY rowid DESC')]
            for p in proposals:
                if p['status']=='PENDING_APPROVAL' and time.time()>p['expires_at']: p['status']='EXPIRED'
            s['topology']=json.loads((Path(__file__).parent/'topology.json').read_text())
            for edge in s['topology']['edges']:
                if edge[0]=='INT-01': edge[2]=s['production'][0]/.48/2
                elif edge[0].startswith('RO-'): edge[2]=edge[2]*s['production'][0]/600
                elif edge[1]=='PMP-01': edge[2]+=s['loss']/3
                elif edge[1] in ('V-04','SEC-04'): edge[2]=0 if s['valve']=='CLOSED' else 110+s['loss']
            if s['valve']=='CLOSED': s['topology']['edges'].append(['PMP-01','SEC-04',110])
            s['proposals']=proposals
            s['diagnostics']=diagnose(s['quality_samples'])
            s['leak']=leak_evidence(s)
            s['plans']={k:dict(project(s,v), **{'validation':validation(s,{'kind':'schedule','production':v})}) for k,v in PLANS.items()}
            optimized=optimize(s)
            if optimized is not None:
                s['plans']['optimized']=dict(project(s,optimized), validation=validation(s,{'kind':'schedule','production':optimized}))
            s['audit']=[dict(seq=r[0],at=r[1],actor=r[2],event=r[3],body=json.loads(r[4])) for r in c.execute('SELECT * FROM audit ORDER BY seq DESC LIMIT 200')]
            return s
    def transition(self,op):
        with self.db() as c:
            s=self.state(c)
            if op=='reset':
                s=baseline()
                for (pid,body) in c.execute('SELECT id,body FROM proposals').fetchall():
                    p=json.loads(body)
                    if p['status']=='PENDING_APPROVAL':
                        p['status']='EXPIRED';c.execute('UPDATE proposals SET body=? WHERE id=?',(json.dumps(p),pid))
            elif op=='disrupt':
                if s['disrupted']: raise Problem(409,'Scenario already disrupted')
                s.update(disrupted=True,hour=14,quality_alert=True,quarantined=True,loss=65,pressure_s4=1.7,flow_s4=175,quality_samples=[1.02]*8)
            elif op=='sample': pass
            elif op=='quarantine':
                if diagnose(s['quality_samples'])['classification']=='HEALTHY': raise Problem(409,'No sensor fault to quarantine')
                s['quarantined']=True
            else: raise Problem(400,'Unsupported scenario operation')
            s['sampled_at']=time.time();s['version']+=1
            self.save(c,s);self.log(c,'operator',op,{'version':s['version'],'epoch':s['epoch']})
            if op=='disrupt': self.log(c,'diagnostics','sensor_quarantined',{'sensor':'Q-01','classification':'FLATLINE'})
    def stage(self,action,actor='agent'):
        with self.db() as c:
            s=self.state(c); check=validation(s,action)
            p={'id':str(uuid.uuid4()),'version':1,'state_version':s['version'],'epoch':s['epoch'],
               'action':action,'actor':actor,'created_at':time.time(),'expires_at':time.time()+TTL,
               'status':'PENDING_APPROVAL' if check['passed'] else 'BLOCKED_BY_SAFETY','safety':check}
            c.execute('INSERT INTO proposals VALUES(?,?)',(p['id'],json.dumps(p)))
            self.log(c,actor,'proposal_staged',p)
            return p
    def decide(self,pid,version,approve):
        error=None
        with self.db() as c:
            row=c.execute('SELECT body FROM proposals WHERE id=?',(pid,)).fetchone()
            if not row: raise Problem(404,'Proposal not found')
            p=json.loads(row[0]);s=self.state(c)
            if p['version']!=version or p['status']!='PENDING_APPROVAL': raise Problem(409,'Proposal is not pending or version is stale')
            if time.time()>p['expires_at'] or s['version']!=p['state_version'] or s['epoch']!=p['epoch']:
                p['status']='EXPIRED';error='Proposal expired or telemetry state changed; stage a new proposal.'
            elif not approve: p['status']='REJECTED'
            else:
                p['safety']=validation(s,p['action'])
                if not p['safety']['passed']:
                    p['status']='BLOCKED_BY_SAFETY';error='Safety revalidation failed'
                else:
                    self.log(c,'operator','approved',{'proposal':pid})
                    if p['action']['kind']=='isolate': s.update(valve='CLOSED',loss=0,pressure_s4=3.8,flow_s4=110)
                    else: s['production']=p['action']['production']
                    s['version']+=1
                    self.save(c,s);p['status']='EXECUTED_IN_SIMULATION'
                    p['executed_at']=time.time()
            p['version']+=1
            c.execute('UPDATE proposals SET body=? WHERE id=?',(json.dumps(p),pid))
            self.log(c,'operator','proposal_'+p['status'].lower(),p)
        if error: raise Problem(409,error)
        return p
