# GitHub Actions Core: Architecture, Caching & Monorepos

This reference guide provides production-grade architectural patterns for GitHub Actions: workflow triggers, reusable workflows (`workflow_call`), monorepo change detection, dependency caching, service containers, and concurrency control.

---

## 1. Workflow Architecture & Triggers

GitHub Actions pipelines should be modular, isolated, and gated by automated quality checks.

### Standard Trigger Patterns
```yaml
on:
  # 1. Manual triggers with parameters
  workflow_dispatch:
    inputs:
      environment:
        description: "Target deployment environment"
        required: true
        default: "development"
        type: choice
        options:
          - development
          - staging
          - production
      run_migrations:
        description: "Execute database migrations"
        required: true
        default: true
        type: boolean

  # 2. Automated branch pushes with path filters
  push:
    branches:
      - main
      - master
      - staging
    paths:
      - "apps/**"
      - "packages/**"
      - "package.json"
      - "bun.lock"      # or package-lock.json / pnpm-lock.yaml
      - "turbo.json"
      - ".dockerignore"
      - ".github/workflows/**"
      - "!**.md"        # Ignore documentation updates

  # 3. Pull Request validation
  pull_request:
    branches:
      - main
```

---

## 2. Concurrency & Pipeline Gating

Always configure concurrency to prevent redundant builds and race conditions.

### Concurrency Rules
- **For Quality & PR checks**: Cancel in-progress builds to save runner minutes (`cancel-in-progress: true`).
- **For Migrations & Deployments**: Never cancel active deployments mid-flight (`cancel-in-progress: false`).

```yaml
# Cancel outdated PR or build runs
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

# For migrations / production deploys:
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

---

## 3. Monorepo Change Detection (Selective Builds)

In a monorepo (Turborepo, Nx, or custom workspaces), rebuilding and deploying every single service on every push wastes massive compute and leads to deployment churn.

### Pattern: Git Diff Change Detection Step
Detect exactly which applications and shared libraries have changed between commits:

```yaml
jobs:
  changes:
    name: Detect changed services
    runs-on: ubuntu-latest
    outputs:
      bot: ${{ steps.detect.outputs.bot }}
      server: ${{ steps.detect.outputs.server }}
      workers: ${{ steps.detect.outputs.workers }}
      migrator: ${{ steps.detect.outputs.migrator }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full git history required for accurate diffing

      - name: Detect affected services
        id: detect
        env:
          BEFORE_SHA: ${{ github.event.before }}
          CURRENT_SHA: ${{ github.sha }}
          EVENT_NAME: ${{ github.event_name }}
        run: |
          set -euo pipefail

          # Fallback: On manual dispatch or initial commit, build everything
          if [[ "$EVENT_NAME" == "workflow_dispatch" || -z "${BEFORE_SHA:-}" || "$BEFORE_SHA" == "0000000000000000000000000000000000000000" ]]; then
            echo "bot=true" >> "$GITHUB_OUTPUT"
            echo "server=true" >> "$GITHUB_OUTPUT"
            echo "workers=true" >> "$GITHUB_OUTPUT"
            echo "migrator=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          # Files that affect ALL services when changed
          shared=(packages package.json bun.lock turbo.json .dockerignore .github/workflows/**)

          # Check individual services
          for service in bot server workers; do
            if git diff --quiet "$BEFORE_SHA" "$CURRENT_SHA" -- \
              "apps/$service" \
              ":(exclude)apps/$service/README.md" \
              "${shared[@]}"; then
              echo "$service=false" >> "$GITHUB_OUTPUT"
            else
              echo "$service=true" >> "$GITHUB_OUTPUT"
            fi
          done

          # Check database / migrator
          if git diff --quiet "$BEFORE_SHA" "$CURRENT_SHA" -- \
            "apps/migrator" \
            "packages/db" \
            "${shared[@]}"; then
            echo "migrator=false" >> "$GITHUB_OUTPUT"
          else
            echo "migrator=true" >> "$GITHUB_OUTPUT"
          fi
```

---

## 4. Reusable Workflows (`workflow_call`)

Reusable workflows centralize duplicate logic across development, staging, and production environments.

### Defining a Reusable Workflow (`_build-deploy.yml`)
```yaml
name: Reusable Build and Deploy

on:
  workflow_call:
    inputs:
      app_name:
        required: true
        type: string
      dockerfile:
        required: true
        type: string
      build_args:
        required: false
        type: string
      environment:
        required: false
        type: string
        default: "production"
    secrets:
      REGISTRY_USERNAME:
        required: true
      REGISTRY_PASSWORD:
        required: true
      DEPLOY_WEBHOOK:
        required: true

jobs:
  build:
    name: Build & Deploy ${{ inputs.app_name }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... docker build & deploy steps ...
```

### Calling a Reusable Workflow
```yaml
jobs:
  deploy-bot:
    needs: [quality, changes]
    if: needs.changes.outputs.bot == 'true'
    uses: ./.github/workflows/_build-deploy.yml
    with:
      app_name: bot
      dockerfile: apps/bot/Dockerfile
    secrets:
      REGISTRY_USERNAME: ${{ secrets.REGISTRY_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
      DEPLOY_WEBHOOK: ${{ secrets.DOKPLOY_BOT_WEBHOOK }}
```

---

## 5. High-Performance Caching

Reduce CI times from 10 minutes to under 60 seconds with proper multi-layer caching:

### Bun & Turborepo Cache
```yaml
- name: Set up Bun
  uses: oven-sh/setup-bun@v2
  with:
    bun-version: 1.2.0

- name: Restore Bun and Turborepo caches
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      .turbo
    key: quality-${{ runner.os }}-${{ hashFiles('bun.lock', '**/turbo.json') }}
    restore-keys: |
      quality-${{ runner.os }}-${{ hashFiles('bun.lock', '**/turbo.json') }}-
      quality-${{ runner.os }}-

- name: Install dependencies
  run: bun install --frozen-lockfile
```

### Node.js & pnpm Cache
```yaml
- name: Set up pnpm
  uses: pnpm/action-setup@v3
  with:
    version: 9

- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "pnpm"
```

---

## 6. Service Containers for Integration Tests

Spin up ephemeral Redis, PostgreSQL, or RabbitMQ databases directly on the runner for end-to-end and integration tests:

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test_user -d test_db"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      NODE_ENV: test
      REDIS_URL: redis://127.0.0.1:6379
      DATABASE_URL: postgresql://test_user:test_password@127.0.0.1:5432/test_db
```
