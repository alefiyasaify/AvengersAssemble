# Root Makefile: delegates to package Makefiles / scripts.
# Targets whose package is not scaffolded yet print a TODO and exit 0.
# Requires GNU make and a POSIX shell (Git Bash on Windows).

SHELL := /bin/sh
.DEFAULT_GOAL := help

BACKEND  := backend
FRONTEND := frontend
TESTS    := tests

# $(call delegate,<dir>,<marker file>,<command>,<label>)
define delegate
	@if [ -f "$(1)/$(2)" ]; then \
		$(3); \
	else \
		echo "TODO: $(4) - $(1)/ is not scaffolded yet ($(1)/$(2) missing). Skipping."; \
	fi
endef

.PHONY: help doctor setup dev up down test lint typecheck gen-openapi gen-client gen-contract check-contract migrate e2e mock-api

help: ## List available targets
	@echo "Usage: make <target>"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

doctor: ## Check developer prerequisites (git, GNU make, uv, node, pnpm, docker, pre-commit)
	@sh scripts/doctor.sh

setup: ## Install all deps, pre-commit hooks, copy .env.example -> .env per package
	@if command -v pre-commit >/dev/null 2>&1; then \
		pre-commit install && pre-commit install --hook-type commit-msg; \
	else \
		echo "WARN: pre-commit not installed; skipping hook installation."; \
	fi
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) setup,backend setup)
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm install --frozen-lockfile,frontend setup)
	$(call delegate,$(TESTS),Makefile,$(MAKE) -C $(TESTS) setup,tests setup)
	@for d in $(BACKEND) $(FRONTEND) $(TESTS); do \
		if [ -f "$$d/.env.example" ] && [ ! -f "$$d/.env" ]; then cp "$$d/.env.example" "$$d/.env"; echo "Created $$d/.env"; fi; \
	done

dev: ## Run backend (:8000) and frontend (:3000) locally
	@if [ -f "$(BACKEND)/Makefile" ] && [ -f "$(FRONTEND)/package.json" ]; then \
		trap 'kill 0' INT TERM; \
		$(MAKE) -C $(BACKEND) run & \
		(cd $(FRONTEND) && pnpm dev) & \
		wait; \
	elif [ -f "$(BACKEND)/Makefile" ]; then \
		$(MAKE) -C $(BACKEND) run; \
	elif [ -f "$(FRONTEND)/package.json" ]; then \
		cd $(FRONTEND) && pnpm dev; \
	else \
		echo "TODO: dev - neither backend/ nor frontend/ is scaffolded yet. Skipping."; \
	fi

up: ## Run the full stack in Docker
	$(call delegate,.,docker-compose.yml,docker compose up -d --wait,docker compose up)

down: ## Stop the Docker stack
	$(call delegate,.,docker-compose.yml,docker compose down,docker compose down)

test: ## Run all unit/integration tests
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) test,backend tests)
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm test,frontend tests)

lint: ## Lint all packages
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) lint,backend lint)
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm lint && pnpm format:check,frontend lint)
	$(call delegate,$(TESTS),Makefile,$(MAKE) -C $(TESTS) lint,tests lint)

typecheck: ## Type-check all packages
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) typecheck,backend typecheck)
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm typecheck,frontend typecheck)
	$(call delegate,$(TESTS),Makefile,$(MAKE) -C $(TESTS) typecheck,tests typecheck)

gen-openapi: ## Export backend/openapi.json (deterministic)
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) gen-openapi,gen-openapi)

gen-client: ## Regenerate the TS client from backend/openapi.json
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm gen:client,gen-client)

gen-contract: gen-openapi gen-client ## Regenerate spec AND client in one go (after any API change)

check-contract: ## Fail if openapi.json or the generated TS client is out of sync with the backend code
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) check-openapi,backend spec drift check)
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm check:client,frontend client drift check)

migrate: ## Apply Alembic migrations
	$(call delegate,$(BACKEND),Makefile,$(MAKE) -C $(BACKEND) migrate,migrate)

e2e: ## Start the isolated e2e stack and run the smoke suite (docs/06)
	$(call delegate,$(TESTS),Makefile,$(MAKE) -C $(TESTS) stack-up && $(MAKE) -C $(TESTS) e2e-smoke,e2e smoke)

mock-api: ## Prism mock server for the spec on :4010
	$(call delegate,$(FRONTEND),package.json,cd $(FRONTEND) && pnpm mock:api,mock-api)
