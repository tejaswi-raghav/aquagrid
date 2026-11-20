import json
from pydantic import ValidationError
from .operations import Operations,OpsError,Candidate,ProposalRequest,Decision,Event
from .repository import Conflict,Missing
from . import security

def dispatch(method,path,raw):
    try:
        body=json.loads(raw or b'{}')
        if not isinstance(body,dict):raise ValueError('JSON object required')
        ops=Operations()
        if path=='/api/ops/create_story' and method=='POST':return 200,ops.create_story()
        if path=='/api/ops/create' and method=='POST':return 200,ops.enrich(ops.create())
        if path=='/api/ops/read' and method=='POST':return 200,ops.read_network_telemetry(body['scenario_id'])
        if path=='/api/ops/feeds' and method=='POST':return 200,ops.read_tariff_and_quality_feeds(body['scenario_id'])
        if path=='/api/ops/preview' and method=='POST':return 200,ops.preview(Candidate.model_validate(body))
        if path=='/api/ops/stage' and method=='POST':return 200,ops.stage_gated_valve_or_setpoint_action(ProposalRequest.model_validate(body))
        if path=='/api/ops/decision' and method=='POST':return 200,ops.decide(Decision.model_validate(body))
        if path=='/api/ops/event' and method=='POST':return 200,ops.event(Event.model_validate(body))
        if path=='/api/ops/ask' and method=='POST':
            from .analyst import Analyst,AskRequest
            return 200,Analyst(ops).ask(AskRequest.model_validate(body))
        if path=='/api/ops/actuate':return 403,{'error':'AI and direct actuator access denied. Use the staged human-approval gateway.'}
        return 404,{'error':'Unknown operational route'}
    except ValidationError as e:return 422,{'error':'Invalid typed request','details':e.errors(include_url=False,include_context=False)}
    except (ValueError,KeyError) as e:return 400,{'error':str(e)}
    except security.AuthError as e:return e.status,{'error':str(e)}
    except (Conflict,OpsError) as e:return getattr(e,'status',409),{'error':str(e)}
    except Missing as e:return 404,{'error':str(e)}
    except Exception:
        import traceback
        traceback.print_exc()
        return 503,{'error':'Operational service unavailable; no action was committed.'}
