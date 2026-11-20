"""The agent's entire tool surface. There is intentionally no execution tool."""
from .operations import Operations,ProposalRequest

def read_network_telemetry(scenario_id:str):
    return Operations().read_network_telemetry(scenario_id)

def read_tariff_and_quality_feeds(scenario_id:str):
    return Operations().read_tariff_and_quality_feeds(scenario_id)

def stage_gated_valve_or_setpoint_action(request:ProposalRequest):
    return Operations().stage_gated_valve_or_setpoint_action(request)
