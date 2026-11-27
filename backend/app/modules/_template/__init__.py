"""MODULE TEMPLATE - copy, do not import.

How to add a module (docs/05 checklist):
1. `cp -r app/modules/_template app/modules/<name>`; rename `Example`/`examples` throughout.
   operation ids become `<name>_<verb>_<noun>`, tags `["<name>"]`.
2. Models in `models.py`, then `make revision m="add_<name>_table"`; review the migration by hand.
3. Schemas, repository (+ tests), service (+ unit tests with a fake repository), router (+
   integration tests with the `client` fixture).
4. Add the router to `MODULE_ROUTERS` in `app/main.py`.
5. Add a `protected` import-linter contract for the module in `pyproject.toml` (copy the
   health one).
6. `make gen-openapi` (and `make gen-client` at the root); label the PR `contract-change`.
7. Update docs and the module list in `docs/01-architecture.md`.

This package is excluded from route registration, test collection and coverage.
"""
