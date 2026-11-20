import json,ssl,sys,os
from urllib.request import Request,urlopen
from urllib.error import HTTPError
try:
 import certifi
 ctx=ssl.create_default_context(cafile=certifi.where())
except ImportError:ctx=ssl.create_default_context()
base=sys.argv[1]
def call(path,body):
 try:
  with urlopen(Request(base+'/api/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),context=ctx,timeout=90) as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,json.load(e)
def ok(path,body):
 status,data=call(path,body)
 assert status==200,(path,status,data)
 return data
r=ok('ops/create',{});rid=r['id'];assert r['storage_backend']=='private-blob-cas',r['storage_backend'];print('Private cloud create + EPANET: PASS',flush=True)
token=ok('auth/login',{'operator_id':'CR-07','pin':'2468'})['token'];analyst=ok('auth/login',{'operator_id':'AN-02','pin':'1357'})['token']
def args(**kw):return dict(scenario_id=rid,version=r['version'],**kw)
r=ok('ops/event',args(token=token,operation='compound'));assert r['evidence']['sensor']['classification']=='FLATLINE';assert r['evidence']['leak']['confirmed'];print('Compound diagnosis:',round(r['evidence']['hydraulics']['leak_m3h'],2),'m3/h; fault isolated',flush=True)
config={**r['config'],'closed':['V-04A']};c=ok('ops/preview',args(config=config));assert 'Al Noor Hospital' in c['graph_impact']['critical_facilities_without_supply'];assert not c['valve_safety']['eligible'];assert ok('ops/read',{'scenario_id':rid})['version']==r['version'];print('Read-only preview + hospital guard: PASS',flush=True)
r=ok('ops/stage',args(kind='schedule',plan='unsafe'));assert r['proposals'][-1]['status']=='BLOCKED_BY_SAFETY';print('Unsafe schedule rejected:',round(r['proposals'][-1]['safety']['projection']['minimum_pct'],2),'%',flush=True)
r=ok('ops/stage',args(kind='valve',valve_id='V-04B'));p=r['proposals'][-1];assert p['status']=='PENDING_APPROVAL';assert r['config']['closed']==[]
assert call('ops/decision',args(token=analyst,proposal_id=p['id']))[0]==403
body=args(token=token,proposal_id=p['id'])
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:call('ops/decision',body),range(2)))
assert sorted(code for code,data in results)==[200,409],[(code,data.get('error')) for code,data in results]
r=ok('ops/read',{'scenario_id':rid});assert r['config']['closed']==['V-04B'];assert len(r['outcomes'])==1;assert r['evidence']['hydraulics']['leak_m3h']<.1;print('Analyst denial + concurrent cloud CAS + persisted valve outcome: PASS',flush=True)
r=ok('ops/event',args(token=token,operation='reset'));r=ok('ops/stage',args(kind='schedule',plan='optimized'));p=r['proposals'][-1];assert p['status']=='PENDING_APPROVAL';r=ok('ops/decision',args(token=token,proposal_id=p['id']));assert r['production']!=[600]*10;print('Optimizer schedule approved and persisted: PASS',flush=True)
config={**r['config'],'leak':35,'sensor':'drift','tariff_factor':1.5};c=ok('ops/preview',args(config=config));assert c['candidate']['sensor']['classification']=='DRIFT';r=ok('ops/stage',args(kind='scenario',config=config));p=r['proposals'][-1];r=ok('ops/decision',args(token=token,proposal_id=p['id']));assert r['config']['sensor']=='drift';assert r['evidence']['leak']['confirmed'];assert call('ops/actuate',{})[0]==403
report={'base':base,'status':'PASS','solver':r['evidence']['hydraulics']['solver'],'storage':r['storage_backend'],'outcomes':len(r['outcomes']),'audit_events':len(r['audit']),'checks':['compound leak vs flatline','hospital isolation blocked','preview read-only','unsafe schedule rejected','analyst denied','concurrent cloud approval one winner','valve replay persisted','optimized schedule persisted','scenario drift + leak approved','direct AI denied']}
print(json.dumps(report,indent=2),flush=True)
