from __future__ import annotations

from dataclasses import dataclass
import re


_UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class GraphObject:
    object_id: str
    category: str


@dataclass(frozen=True, slots=True)
class ReferenceEdge:
    source_id: str
    target_id: str
    kind: str


@dataclass(frozen=True, slots=True)
class GraphDiagnostic:
    code: str
    source_id: str | None = None
    target_id: str | None = None


@dataclass(frozen=True, slots=True)
class GraphValidation:
    objects: tuple[GraphObject, ...]
    edges: tuple[ReferenceEdge, ...]
    diagnostics: tuple[GraphDiagnostic, ...]

    @property
    def valid(self) -> bool:
        return not self.diagnostics


def validate_reference_graph(
    objects: tuple[GraphObject, ...],
    edges: tuple[ReferenceEdge, ...],
    *,
    prohibited_cycle_kinds: frozenset[str] = frozenset({"structural", "contains", "depends_on"}),
) -> GraphValidation:
    diagnostics: list[GraphDiagnostic] = []
    by_id: dict[str, GraphObject] = {}
    for item in objects:
        if not _UUID_PATTERN.fullmatch(item.object_id):
            diagnostics.append(GraphDiagnostic("invalid_object_id", item.object_id, None))
        if item.object_id in by_id:
            diagnostics.append(GraphDiagnostic("duplicate_object_id", item.object_id, None))
        else:
            by_id[item.object_id] = item
    seen_edges: set[tuple[str, str, str]] = set()
    adjacency: dict[str, list[str]] = {object_id: [] for object_id in by_id}
    valid_edges: list[ReferenceEdge] = []
    for edge in edges:
        key = (edge.source_id, edge.target_id, edge.kind)
        if key in seen_edges:
            diagnostics.append(GraphDiagnostic("duplicate_edge", edge.source_id, edge.target_id))
            continue
        seen_edges.add(key)
        if edge.source_id not in by_id or edge.target_id not in by_id:
            diagnostics.append(GraphDiagnostic("dangling_reference", edge.source_id, edge.target_id))
            continue
        if edge.source_id == edge.target_id:
            diagnostics.append(GraphDiagnostic("self_reference", edge.source_id, edge.target_id))
        valid_edges.append(edge)
        if edge.kind in prohibited_cycle_kinds:
            adjacency[edge.source_id].append(edge.target_id)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visiting:
            diagnostics.append(GraphDiagnostic("prohibited_cycle", node, node))
            return
        if node in visited:
            return
        visiting.add(node)
        for target in sorted(adjacency[node]):
            visit(target)
        visiting.remove(node)
        visited.add(node)

    for node in sorted(adjacency):
        visit(node)
    ordered_objects = tuple(sorted(objects, key=lambda item: (item.category, item.object_id)))
    ordered_edges = tuple(sorted(valid_edges, key=lambda edge: (edge.source_id, edge.target_id, edge.kind)))
    ordered_diagnostics = tuple(sorted(diagnostics, key=lambda item: (item.code, item.source_id or "", item.target_id or "")))
    return GraphValidation(ordered_objects, ordered_edges, ordered_diagnostics)
