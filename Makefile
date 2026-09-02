# Shortcuts for the three loops this project repeats.
#
# SPEC selects the input specification, so a generalization run is just
#   make generate SPEC=spec-alt.txt

AGENT := agent
OUT   := $(AGENT)/generated-app
SPEC  ?= spec.txt

.DEFAULT_GOAL := help
.PHONY: help generate test dev

help: ## List available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

generate: ## Run the agent to scaffold the app from SPEC (replaces previous output)
	cd $(AGENT) && rm -rf generated-app && uv run run.py --spec $(SPEC) --output ./generated-app

test: $(OUT)/node_modules ## Typecheck and test the generated app
	cd $(OUT) && npm run typecheck && npm run test

dev: $(OUT)/node_modules ## Serve the generated app at localhost:5173
	cd $(OUT) && npm run dev

# Install from the lockfile whenever node_modules is missing or older than it, so
# test and dev both work against a freshly generated tree. Expressed as a real
# dependency rather than an unconditional `npm ci` in each recipe: same clean-slate
# guarantee, without reinstalling on every invocation.
$(OUT)/node_modules: $(OUT)/package-lock.json
	cd $(OUT) && npm ci

$(OUT)/package-lock.json:
	@echo "No generated app at $(OUT) — run 'make generate' first."; exit 1
