# Convenience shortcuts, nothing more. Nothing in this repo requires make —
# every target below is a plain command you can run by hand, and the canonical
# instructions live in agent/README.md.
#
# SPEC selects the input specification, so a generalization run is just
#   make generate SPEC=spec-alt.md

AGENT := agent
OUT   := $(AGENT)/generated-app
SPEC  ?= spec.txt

.DEFAULT_GOAL := help
.PHONY: help setup generate test dev

help: ## List available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

setup: ## Install uv if missing, sync the agent env, and check for an API key
	@command -v uv >/dev/null 2>&1 || { \
		echo "uv not found. Installing from https://astral.sh/uv ..."; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	}
	@command -v uv >/dev/null 2>&1 || { \
		echo "uv is installed but not on PATH for this shell."; \
		echo "Open a new terminal (or source your shell profile), then re-run: make setup"; \
		exit 1; \
	}
	cd $(AGENT) && uv sync
	@if [ ! -f $(AGENT)/.env ]; then \
		echo; \
		echo "No $(AGENT)/.env yet. The agent needs an Anthropic API key:"; \
		echo "    echo 'ANTHROPIC_API_KEY=sk-ant-...' > $(AGENT)/.env"; \
	fi
	@echo
	@echo "Ready. Next:  make generate       (writes a fresh app from agent/spec.txt)"
	@echo "         or:  make generate SPEC=spec-alt.md   (a different spec)"

generate: ## Run the agent to scaffold the app from SPEC (replaces previous output)
	cd $(AGENT) && rm -rf generated-app && uv run run.py --spec $(SPEC) --output ./generated-app

test: ## Install from the lockfile, then typecheck and test the generated app
	cd $(OUT) && npm ci && npm run typecheck && npm run test

dev: ## Install from the lockfile, then serve the generated app at localhost:5173
	cd $(OUT) && npm ci && npm run dev
