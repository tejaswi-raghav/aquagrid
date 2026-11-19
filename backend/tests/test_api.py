import copy
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.core import diagnose,validation,baseline

@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path/'test.sqlite','test-password'))
def auth(c):
    return {'Authorization':'Bearer '+c.post('/api/auth/login',json={'password':'test-password'}).json()['token']}
def disrupt(c): return c.post('/api/scenario/disrupt',json={},headers=auth(c))
def stage(c,kind='isolate'):
    return c.post('/api/proposals',json={'kind':kind,**({'production':[400]*4+[800]*4} if kind=='schedule' else {})}).json()
def decide(c,p,**kw): return c.post('/api/proposals/'+p['id']+'/decision',json={'version':p['version'],'approve':True},headers=kw.get('headers',auth(c)))

def test_read_only_telemetry(client):
    first=client.get('/api/telemetry').json()
    assert client.post('/api/telemetry',json={'valve':'CLOSED'}).status_code==405
    assert client.get('/api/telemetry').json()==first

def test_authentication(client):
    assert client.post('/api/auth/login',json={'password':'wrong'}).status_code==401
    assert client.post('/api/scenario/reset',json={}).status_code==401
    assert client.post('/api/scenario/reset',json={},headers={'Authorization':'Bearer fake'}).status_code==401

@pytest.mark.parametrize('values,kind',[([1]*8,'FLATLINE'),([.4,.5,.6,.7,.8,.9,1,1.1],'DRIFT'),([-1]*8,'IMPLAUSIBLE'),([float('inf')]*8,'IMPLAUSIBLE'),([1],'INSUFFICIENT_DATA')])
def test_sensor_classifications(values,kind):
    assert diagnose(values,reference=[.4]*8)['classification']==kind

def test_disruption_and_independent_evidence(client):
    s=disrupt(client).json()
    assert s['quarantined'] and s['diagnostics']['classification']=='FLATLINE'
    assert s['leak']['confirmed'] and s['leak']['excess_m3h']==65
    assert s['plans']['unsafe']['min']==pytest.approx(30.8)
    assert not s['plans']['unsafe']['validation']['passed']
    assert not s['plans']['shift']['validation']['passed']

def test_quality_guard_even_for_low_cost_plan(client):
    disrupt(client)
    p=stage(client,'schedule')
    assert p['status']=='BLOCKED_BY_SAFETY'
    assert any('quality' in x.lower() for x in p['safety']['reasons'])
    assert decide(client,p).status_code==409

def test_floor_over_tariff():
    s=baseline();s['loss']=65
    result=validation(s,{'kind':'schedule','production':[100]*6+[600]*2})
    assert not result['passed'] and result['projection']['min']<35

def test_gateway_denies_direct_actuation(client):
    for headers in [{},auth(client)]:
        assert client.post('/api/actuators/V-04',json={},headers=headers).status_code==403
    assert client.get('/api/telemetry').json()['valve']=='OPEN'
    assert client.get('/api/telemetry').json()['audit'][0]['event']=='direct_actuator_denied'

def test_agent_cannot_approve(client):
    disrupt(client);p=stage(client)
    assert decide(client,p,headers={}).status_code==401
    assert client.get('/api/telemetry').json()['valve']=='OPEN'

def test_safe_execution_and_duplicate(client):
    disrupt(client);p=stage(client)
    assert p['status']=='PENDING_APPROVAL'
    assert decide(client,p).json()['status']=='EXECUTED_IN_SIMULATION'
    s=client.get('/api/telemetry').json()
    assert s['valve']=='CLOSED' and s['loss']==0 and s['flow_s4']==110
    assert s['quality_alert'] and s['quarantined']
    assert decide(client,p).status_code==409
    assert len([a for a in client.get('/api/telemetry').json()['audit'] if a['event']=='proposal_executed_in_simulation'])==1

def test_schedule_execution(client):
    p=stage(client,'schedule')
    assert p['status']=='PENDING_APPROVAL'
    assert decide(client,p).status_code==200
    assert client.get('/api/telemetry').json()['production']==[400]*4+[800]*4

def test_state_change_invalidates_proposal(client):
    p=stage(client,'schedule')
    disrupt(client)
    assert decide(client,p).status_code==409
    assert client.get('/api/telemetry').json()['proposals'][0]['status']=='EXPIRED'

def test_expired_telemetry_revalidation(client):
    p=stage(client,'schedule');store=client.app.state.store
    with store.db() as c:
        s=store.state(c);s['sampled_at']=time.time()-301;store.save(c,s)
    assert decide(client,p).status_code==409
    assert client.get('/api/telemetry').json()['proposals'][0]['status']=='BLOCKED_BY_SAFETY'

def test_proposal_ttl(client):
    p=stage(client,'schedule');store=client.app.state.store
    with store.db() as c:
        import json
        p['expires_at']=time.time()-1;c.execute('UPDATE proposals SET body=? WHERE id=?',(json.dumps(p),p['id']))
    assert decide(client,p).status_code==409

def test_stale_version(client):
    p=stage(client,'schedule');p['version']=2
    assert decide(client,p).status_code==409

def test_rejection(client):
    p=stage(client,'schedule')
    r=client.post('/api/proposals/'+p['id']+'/decision',json={'version':1,'approve':False},headers=auth(client))
    assert r.json()['status']=='REJECTED'

def test_reset_preserves_audit_and_expires(client):
    disrupt(client);p=stage(client)
    before=client.get('/api/telemetry').json()
    s=client.post('/api/scenario/reset',json={},headers=auth(client)).json()
    assert s['epoch']!=before['epoch'] and s['loss']==0 and not s['disrupted']
    assert s['proposals'][0]['status']=='EXPIRED' and len(s['audit'])>len(before['audit'])
    assert decide(client,p).status_code==409

def test_audit_immutable(client):
    with pytest.raises(sqlite3.IntegrityError):
        with client.app.state.store.db() as c:c.execute('DELETE FROM audit')
    with pytest.raises(sqlite3.IntegrityError):
        with client.app.state.store.db() as c:c.execute("UPDATE audit SET actor='x'")

def test_persistence(tmp_path):
    path=tmp_path/'test.sqlite';a=TestClient(create_app(path,'pw'))
    a.post('/api/scenario/disrupt',json={},headers={'Authorization':'Bearer '+a.post('/api/auth/login',json={'password':'pw'}).json()['token']})
    b=TestClient(create_app(path,'pw'))
    assert b.get('/api/telemetry').json()['loss']==65

@pytest.mark.parametrize('body',[{'kind':'valve'},{'kind':'schedule','production':[1]},{'kind':'schedule','production':[801]*8},{'kind':'schedule','production':[-1]*8},{'kind':'isolate','production':[1]*8},{'kind':'isolate','status':'APPROVED'}])
def test_action_schema(client,body):
    assert client.post('/api/proposals',json=body).status_code==422

def test_concurrent_approval_exactly_once(client):
    disrupt(client);p=stage(client);headers=auth(client)
    with ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda _:decide(client,p,headers=headers).status_code,range(2)))
    assert sorted(results)==[200,409]

def test_plan_costs_and_storage(client):
    plans=client.get('/api/telemetry').json()['plans']
    assert plans['baseline']['cost']==3696
    assert plans['shift']['cost']==3136
    assert plans['baseline']['levels'][-1]==66
    assert plans['shift']['validation']['passed']

def test_no_ai_dependency(client):
    assert client.get('/api/brief').json()['provider']=='deterministic fallback'
    assert client.get('/api/health').json()['status']=='ok'

def test_cross_origin_write(client):
    assert client.post('/api/proposals',json={'kind':'isolate'},headers={'Origin':'https://untrusted.example'}).status_code==403

def test_baseline_isolation_rejected(client):
    assert stage(client)['status']=='BLOCKED_BY_SAFETY'

def test_optimizer_restores_initial_storage(client):
    for state in [client.get('/api/telemetry').json(),disrupt(client).json()]:
        p=state['plans']['optimized']
        assert p['min']>=35 and p['levels'][-1]>=state['storage_pct']
        assert all(x%100==0 and 0<=x<=800 for x in p['production'])
        assert p['cost']<=sum(800*3.5*t for t in [.32]*4+[.12]*4)
        assert p['validation']['passed'] is not state['quality_alert']

def test_topology_after_execution(client):
    disrupt(client);p=stage(client);decide(client,p)
    s=client.get('/api/telemetry').json()
    assert ['PMP-01','SEC-04',110] in s['topology']['edges']
    assert next(e for e in s['topology']['edges'] if e[:2]==['V-04','SEC-04'])[2]==0

def test_optimizer_reports_infeasibility():
    from backend.core import optimize
    s=baseline();s['loss']=1000
    assert optimize(s) is None

def test_reset_proposals_cannot_reappear(client):
    p=stage(client,'schedule')
    client.post('/api/scenario/reset',json={},headers=auth(client))
    assert decide(client,p).status_code==409
    assert client.get('/api/telemetry').json()['production']==[600]*8
