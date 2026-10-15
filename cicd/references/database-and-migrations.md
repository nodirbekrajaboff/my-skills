# Database Migrations, Seeding & Safe Deployment Sequencing

This reference guide details zero-downtime database migration architecture in CI/CD pipelines: sequencing dependencies, the Expand-and-Contract pattern, automated polling, and manual seed/backup workflows.

---

## 1. Zero-Downtime Migration Architecture

In modern production systems, running database migrations inside the main application's startup command (e.g. `npm run start`) leads to critical race conditions when running multiple replicas.

### Core Principles
1. **Dedicated Migrator Job**: Package migration logic (Drizzle, Prisma, TypeORM, Flyway, Liquibase) into a dedicated, lightweight container image.
2. **Execute Before Services**: In GitHub Actions, trigger the migrator first, wait for completion, and only then proceed to deploy dependent services.
3. **Expand and Contract Pattern**: Never introduce breaking database changes in a single release.
   - **Step 1 (Expand)**: Add the new column/table without deleting or renaming the old one. Code supports both.
   - **Step 2 (Migrate Data)**: Backfill data from old column to new column.
   - **Step 3 (Contract)**: In a subsequent deployment, drop the old column/table once all running services use the new schema.

---

## 2. CI/CD Pipeline Sequencing

In GitHub Actions, use `needs: [quality, changes, migrator]` and conditional expressions to guarantee proper execution order:

```yaml
jobs:
  quality:
    uses: ./.github/workflows/_quality.yml

  changes:
    runs-on: ubuntu-latest
    # outputs: migrator, bot, server ...

  migrator:
    needs: [quality, changes]
    if: needs.changes.outputs.migrator == 'true'
    # Build image, trigger migration on Dokploy/Server, and wait for completion
    uses: ./.github/workflows/ci-cd-migrator.yml
    secrets: inherit

  services:
    needs: [quality, changes, migrator]
    # CRITICAL: Deploy services ONLY if quality succeeded AND migrator succeeded (or was skipped)
    if: |
      always() &&
      needs.quality.result == 'success' &&
      (needs.migrator.result == 'success' || needs.migrator.result == 'skipped') &&
      needs.changes.outputs.server == 'true'
    uses: ./.github/workflows/_build-deploy.yml
    with:
      app_name: server
      dockerfile: apps/server/Dockerfile
    secrets: inherit
```

---

## 3. Dedicated Migrator Workflow Pattern (Dokploy Example)

A dedicated migrator pipeline that builds the migration image, executes it via Dokploy API, and monitors execution until exit:

```yaml
name: Migrator Pipeline

on:
  workflow_call:
  workflow_dispatch:

concurrency:
  group: database-migration-prod
  cancel-in-progress: false # NEVER cancel migrations mid-run

jobs:
  build:
    name: Build Migrator Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ secrets.REGISTRY_URL }}
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/migrator/Dockerfile
          push: true
          tags: ${{ secrets.REGISTRY_URL }}/app-migrator:${{ github.sha }}
          cache-from: type=gha,scope=migrator
          cache-to: type=gha,mode=max,scope=migrator

  migrate:
    name: Execute Migrations on Server Controller
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Trigger Dokploy Redeploy
        run: |
          curl --fail-with-body --silent --show-error \
            --request POST \
            --header "Content-Type: application/json" \
            --header "x-api-key: ${{ secrets.DOKPLOY_API_TOKEN }}" \
            --data "{\"composeId\":\"${{ secrets.DOKPLOY_MIGRATOR_COMPOSE_ID }}\",\"title\":\"Migration ${{ github.sha }}\"}" \
            "${{ secrets.DOKPLOY_URL }}/api/compose.redeploy"

      - name: Poll Migration Status
        run: |
          sleep 5
          for attempt in $(seq 1 36); do
            res=$(curl --fail-with-body --silent --show-error \
              --header "x-api-key: ${{ secrets.DOKPLOY_API_TOKEN }}" \
              "${{ secrets.DOKPLOY_URL }}/api/compose.one?composeId=${{ secrets.DOKPLOY_MIGRATOR_COMPOSE_ID }}")
            
            status=$(jq -r '.composeStatus // empty' <<<"$res")
            echo "Migration status: ${status:-unknown} (attempt ${attempt}/36)"

            case "$status" in
              done)
                echo "✅ Database migrations completed successfully!"
                exit 0
                ;;
              error)
                echo "❌ Database migrations failed! Aborting deployment."
                exit 1
                ;;
              idle|running|"")
                sleep 5
                ;;
            esac
          done
          echo "⏱️ Migration timed out."
          exit 1
```

---

## 4. Manual Maintenance & Seeding Workflows

Workflows for seeding initial data or test environments should only be triggered manually with environment controls:

```yaml
name: Database Seed (Manual)

on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        default: "development"
        type: choice
        options:
          - development
          - production

concurrency:
  group: db-seed-${{ github.event.inputs.environment }}
  cancel-in-progress: false

jobs:
  seed:
    runs-on: ubuntu-latest
    env:
      TARGET_ID: ${{ github.event.inputs.environment == 'production' && secrets.DOKPLOY_SEED_PROD_ID || secrets.DOKPLOY_SEED_DEV_ID }}
    steps:
      - name: Validate Target Secret
        run: |
          if [ -z "$TARGET_ID" ]; then
            echo "Error: Target ID secret is not set!"
            exit 1
          fi
      # ... trigger and poll Dokploy ...
```
