from __future__ import annotations

import pytest

from contam_studio_core.ai_gateway import AiError, ApprovalBroker, ApprovalRisk, DisclosureClass, DomainToolGateway, EvidenceItem, make_evidence_bundle, make_simulation_plan


def test_evidence_bundle_is_bounded_and_path_free() -> None:
    item = EvidenceItem("ev-1", "zone_summary", "zone-1", "a" * 64, "volume=300 m3", DisclosureClass.LOCAL_ONLY, "Zone 1")
    bundle = make_evidence_bundle(baseline_sha256="b" * 64, revision_id="rev-1", items=(item,))
    assert bundle.preview()["item_count"] == 1
    with pytest.raises(AiError, match="路径"):
        make_evidence_bundle(baseline_sha256="b" * 64, revision_id="rev-1", items=(EvidenceItem("ev-2", "source_path", "x", "a" * 64, "C:/secret", DisclosureClass.LOCAL_ONLY, "bad"),))


def test_approval_broker_is_hash_bound_single_use() -> None:
    broker = ApprovalBroker()
    action = {"operation": "replace_scalar", "object_id": "zone-1", "value": 650, "unit": "m3"}
    approval = broker.prepare(action, risk=ApprovalRisk.PATCH, user_id="user")
    assert broker.consume(approval.approval_id, action, user_id="user").used
    with pytest.raises(AiError, match="已使用"):
        broker.consume(approval.approval_id, action, user_id="user")
    approval = broker.prepare(action, risk=ApprovalRisk.PATCH, user_id="user")
    with pytest.raises(AiError, match="哈希"):
        broker.consume(approval.approval_id, {**action, "value": 700}, user_id="user")


def test_domain_gateway_rejects_machine_authority() -> None:
    gateway = DomainToolGateway()
    gateway.register_read_only("inspect_project", lambda payload: {"status": "supported"})
    assert gateway.call("inspect_project", {"project_id": "project-1"})["status"] == "supported"
    with pytest.raises(AiError, match="路径"):
        gateway.call("inspect_project", {"path": "C:/secret"})
    with pytest.raises(AiError):
        gateway.call("run_shell", {})


def test_simulation_plan_never_hides_defaults() -> None:
    plan = make_simulation_plan(goal="compare volume", profile="strict", evidence_ids=("ev-1",), open_questions=("weather?",), assumptions=(("occupancy", "user confirmed"),), actions=("replace_scalar",), risks=("tool unavailable",))
    assert plan.plan_id and plan.open_questions
    with pytest.raises(AiError, match="默认"):
        make_simulation_plan(goal="bad", profile="strict", evidence_ids=(), open_questions=(), assumptions=(("default_weather", "clear"),), actions=(), risks=())
