import os
import secrets
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from backend.core import Store, Problem

ROOT=Path(__file__).resolve().parents[1]
class Login(BaseModel):
    password: str = Field(max_length=200)
class Action(BaseModel):
    model_config=ConfigDict(extra='forbid')
    kind: Literal['schedule','isolate']
    production: list[float] | None = None
    def action(self):
        if self.kind=='schedule':
            if self.production is None or len(self.production)!=8 or any(not 0<=x<=800 for x in self.production):
                raise HTTPException(422,'Schedule requires eight finite hourly setpoints in [0,800] m³/h')
        elif self.production is not None: raise HTTPException(422,'Isolation cannot carry production setpoints')
        return self.model_dump(exclude_none=True)
class Decision(BaseModel):
    version: int = Field(ge=1)
    approve: bool

def create_app(db_path=None,password=None):
    path=Path(db_path or os.getenv('AQUAGRID_DB',ROOT/'data/aquagrid.sqlite'))
    path.parent.mkdir(parents=True,exist_ok=True)
    store=Store(path)
    operator_password=password or os.getenv('AQUAGRID_OPERATOR_PASSWORD')
    if not operator_password: raise RuntimeError('Set AQUAGRID_OPERATOR_PASSWORD before starting the backend.')
    app=FastAPI(title='AquaGrid simulated operations API',version='1.0.0')
    app.state.store=store
    @app.exception_handler(Problem)
    async def problem(request,exc): return JSONResponse(status_code=exc.status,content={'detail':exc.detail})
    def operator(request:Request):
        token=request.headers.get('authorization','').removeprefix('Bearer ')
        if not token or not store.authenticated(token): raise HTTPException(401,'Sign in as demo operator')
        return 'operator'
    @app.middleware('http')
    async def headers(request,call_next):
        # Reject cross-origin browser writes; no permissive CORS.
        origin=request.headers.get('origin')
        if request.method not in ('GET','HEAD','OPTIONS') and origin and origin!=str(request.base_url).rstrip('/'):
            return JSONResponse(status_code=403,content={'detail':'Cross-origin writes are forbidden'})
        response=await call_next(request)
        if request.url.path.startswith('/api'): response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        return response
    @app.get('/api/health')
    def health(): return {'status':'ok','mode':'synthetic','storage':'sqlite','ai':'deterministic fallback'}
    @app.post('/api/auth/login')
    def login(body:Login):
        if not secrets.compare_digest(body.password,operator_password): raise HTTPException(401,'Invalid operator password')
        return {'token':store.login(),'expires_in':3600,'role':'operator'}
    @app.get('/api/telemetry')
    def telemetry(): return store.snapshot()
    @app.get('/api/feeds')
    def feeds():
        s=store.snapshot()
        return {'tariffs':[.32]*4+[.12]*4,'currency':'USD','quality_alert':s['quality_alert'],'sampled_at':s['sampled_at']}
    @app.post('/api/scenario/{operation}')
    def scenario(operation:Literal['reset','disrupt','sample','quarantine'],who=Depends(operator)):
        store.transition(operation);return store.snapshot()
    @app.post('/api/proposals')
    def proposals(body:Action): return store.stage(body.action())
    @app.post('/api/proposals/{pid}/decision')
    def decision(pid:str,body:Decision,who=Depends(operator)): return store.decide(pid,body.version,body.approve)
    @app.post('/api/actuators/{asset}')
    def deny(asset:str):
        with store.db() as c: store.log(c,'agent','direct_actuator_denied',{'asset':asset})
        raise HTTPException(403,'Direct actuator access is forbidden. Stage a proposal and obtain operator authorization.')
    @app.get('/api/brief')
    def brief():
        s=store.snapshot()
        return {'provider':'deterministic fallback','observation':s['leak'],
                'sensor':s['diagnostics'],'proposal':'isolate V-04 using the modeled bypass' if s['leak']['confirmed'] else 'maintain production',
                'quality':'unresolved' if s['quality_alert'] else 'baseline', 'authorization':'operator required; no agent approval tool'}
    app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='frontend')
    return app
