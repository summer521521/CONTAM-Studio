from __future__ import annotations

from dataclasses import replace

import pytest

from contam_studio_core.domain_projection import DomainProjectionError, project_levels_and_zones
from contam_studio_core.prj_zone_models import PrjZoneDocument, ZoneDocumentRecord


SHA = "a" * 64


def document(*zones: ZoneDocumentRecord) -> PrjZoneDocument:
    return PrjZoneDocument(
        schema_version="1.0",
        reader_mode="strict_contam_3_4_simple_zone_v1",
        source_path="sample.prj",
        source_sha256=SHA,
        source_size_bytes=200,
        source_unchanged=True,
        header_version="3.4.0.4",
        header_variant=0,
        declared_zone_count=len(zones),
        zones=zones,
        diagnostics=(),
    )


Z1 = ZoneDocumentRecord(1, "Office", 3, 1, 0.0, 600.0, 10)
Z2 = ZoneDocumentRecord(2, "Lab", 3, 2, 3.0, 300.0, 11)


def test_projection_groups_levels_and_exposes_bounded_capabilities() -> None:
    result = project_levels_and_zones(document(Z2, Z1))
    assert [level.level_number for level in result.levels] == [1, 2]
    assert result.levels[0].zone_ids == (result.zones[0].zone_id,)
    assert result.zones[0].capabilities["volume_m3"].state == "editable_via_patch"
    assert result.zones[0].capabilities["volume_m3"].unit == "m3"
    assert result.zones[0].evidence.evidence_id.startswith("ev-")


def test_identity_is_stable_for_order_and_changes_with_baseline() -> None:
    first = project_levels_and_zones(document(Z1, Z2))
    repeated = project_levels_and_zones(document(Z2, Z1))
    assert [level.level_id for level in first.levels] == [level.level_id for level in repeated.levels]
    assert [zone.zone_id for zone in first.zones] == [zone.zone_id for zone in repeated.zones]
    changed = project_levels_and_zones(replace(document(Z1, Z2), source_sha256="b" * 64))
    assert [zone.zone_id for zone in changed.zones] != [zone.zone_id for zone in first.zones]


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("volume_m3", float("nan"), "volume_range_invalid"),
        ("volume_m3", float("inf"), "volume_range_invalid"),
        ("volume_m3", 0.0, "volume_range_invalid"),
        ("relative_height", float("inf"), "relative_height_invalid"),
        ("level_number", -1, "zone_range_invalid"),
        ("name", "bad name", "zone_label_invalid"),
    ],
)
def test_unsafe_profile_values_are_rejected(field: str, value: object, code: str) -> None:
    with pytest.raises(DomainProjectionError) as captured:
        project_levels_and_zones(document(replace(Z1, **{field: value})))
    assert captured.value.code == code


def test_incompatible_profile_and_hash_fail_closed() -> None:
    with pytest.raises(DomainProjectionError, match="profile"):
        project_levels_and_zones(replace(document(Z1), reader_mode="other"))
    with pytest.raises(DomainProjectionError) as captured:
        project_levels_and_zones(replace(document(Z1), source_sha256="not-a-hash"))
    assert captured.value.code == "invalid_baseline_hash"
