.PHONY: dev build start bootstrap seed-demo reset backup restore test test-e2e typecheck docker

dev: ## Run the app locally at http://localhost:3000 (also on the LAN, for phones)
	npm run dev

build:
	npm run build

start: build
	npm start

bootstrap: ## Create the first Keeper account and print the invite code
	npm run bootstrap

seed-demo: ## Load the Zeeland demo dataset
	npm run seed-demo

reset: ## Delete ./data and start over
	@printf 'This deletes ./data (database, assets, backups). Type "yes" to confirm: ' && read ans && [ "$$ans" = "yes" ] && rm -rf ./data && echo "Deleted ./data" || echo "Cancelled"

backup: ## Write a full zip (JSON of every table + all assets) to ./data/backups
	npm run backup

restore: ## Restore from a backup zip: make restore FILE=./data/backups/xxx.zip
	npm run restore -- $(FILE)

test:
	npm test

test-e2e:
	npm run test:e2e

typecheck:
	npm run typecheck

docker: ## Verify the exact production image locally, same ./data folder
	docker compose up --build
