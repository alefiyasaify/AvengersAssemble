"""App factory, OpenAPI contract conventions and the deterministic spec export."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.pagination import Page, page_params
from app.main import create_app
from conftest import make_settings
from scripts import export_openapi


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    return export_openapi.build_spec()


def test_openapi_operations_follow_contract_conventions_always(spec: dict[str, Any]) -> None:
    operation_ids: list[str] = []
    for path, methods in spec["paths"].items():
        assert path.startswith("/api/v1/")
        for operation in methods.values():
            module = operation["tags"][0]
            assert operation["operationId"].startswith(f"{module}_")
            assert "500" in operation["responses"]
            operation_ids.append(operation["operationId"])
    assert len(operation_ids) == len(set(operation_ids))
    assert {"health_get_live", "health_get_ready", "health_get_version"} <= set(operation_ids)


def test_export_is_deterministic_when_run_twice(spec: dict[str, Any]) -> None:
    assert export_openapi.render(spec) == export_openapi.render(export_openapi.build_spec())


def test_export_check_detects_drift_when_file_differs(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"
    assert export_openapi.main(["--output", str(target)]) == 0
    assert export_openapi.main(["--output", str(target), "--check"]) == 0
    target.write_text("{}", encoding="utf-8")
    assert export_openapi.main(["--output", str(target), "--check"]) == 1


def test_docs_disabled_when_production(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'p.db').as_posix()}"
    app = create_app(make_settings(url, app_env="production"))
    try:
        client = TestClient(app)
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
    finally:
        app.state.engine.dispose()


def test_page_params_and_page_envelope_shape_always() -> None:
    params = page_params(limit=5, offset=10)
    page = Page[int](items=[1, 2], total=12, limit=params.limit, offset=params.offset)
    assert page.model_dump() == {"items": [1, 2], "total": 12, "limit": 5, "offset": 10}
