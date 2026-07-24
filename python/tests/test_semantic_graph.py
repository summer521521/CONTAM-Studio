from __future__ import annotations

from contam_studio_core.semantic_graph import GraphObject, ReferenceEdge, validate_reference_graph


ONE = "00000000-0000-5000-8000-000000000001"
TWO = "00000000-0000-5000-8000-000000000002"


def test_graph_orders_objects_and_edges_deterministically() -> None:
    result = validate_reference_graph(
        (GraphObject(TWO, "zone"), GraphObject(ONE, "level")),
        (ReferenceEdge(TWO, ONE, "contains"),),
    )
    assert result.valid
    assert tuple(item.object_id for item in result.objects) == (ONE, TWO)
    assert result.edges[0].source_id == TWO


def test_graph_rejects_invalid_ids_duplicates_dangling_and_self_reference() -> None:
    result = validate_reference_graph(
        (GraphObject(ONE, "zone"), GraphObject(ONE, "zone"), GraphObject("bad", "zone")),
        (ReferenceEdge(ONE, "missing", "contains"), ReferenceEdge(ONE, ONE, "contains")),
    )
    assert not result.valid
    assert {item.code for item in result.diagnostics} >= {"duplicate_object_id", "invalid_object_id", "dangling_reference", "self_reference"}


def test_graph_rejects_prohibited_cycles_but_keeps_edge_order() -> None:
    result = validate_reference_graph(
        (GraphObject(ONE, "zone"), GraphObject(TWO, "zone")),
        (ReferenceEdge(ONE, TWO, "contains"), ReferenceEdge(TWO, ONE, "contains")),
    )
    assert not result.valid
    assert any(item.code == "prohibited_cycle" for item in result.diagnostics)


def test_graph_rejects_duplicate_edges() -> None:
    result = validate_reference_graph(
        (GraphObject(ONE, "zone"), GraphObject(TWO, "zone")),
        (ReferenceEdge(ONE, TWO, "depends_on"), ReferenceEdge(ONE, TWO, "depends_on")),
    )
    assert not result.valid
    assert any(item.code == "duplicate_edge" for item in result.diagnostics)
