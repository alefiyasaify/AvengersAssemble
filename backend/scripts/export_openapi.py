"""Write the OpenAPI spec deterministically (sorted keys, indent 2, trailing newline).

Usage (from backend/): uv run python -m scripts.export_openapi [--output openapi.json] [--check]
`--check` exits 1 if the file on disk differs from the generated spec (CI drift check).
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"


def build_spec() -> dict[str, Any]:
    # Spec generation needs no real config: explicit throwaway values, no DB file is created
    # (in-memory SQLite) and nothing is read from the environment.
    settings = Settings(
        _env_file=None,
        app_env="ci",
        database_url="sqlite:///:memory:",
        secret_key=SecretStr("openapi-export-only-not-a-secret-value"),
    )
    spec: dict[str, Any] = create_app(settings).openapi()
    return spec


def render(spec: dict[str, Any]) -> str:
    return json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail if the file is out of date")
    args = parser.parse_args(argv)

    content = render(build_spec())
    output: Path = args.output
    if args.check:
        current = output.read_text(encoding="utf-8") if output.exists() else ""
        if current != content:
            sys.stderr.write(f"{output} is out of date. Run `make gen-openapi` and commit it.\n")
            return 1
        sys.stdout.write(f"{output} is up to date.\n")
        return 0
    output.write_text(content, encoding="utf-8", newline="\n")
    sys.stdout.write(f"Wrote {output}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
