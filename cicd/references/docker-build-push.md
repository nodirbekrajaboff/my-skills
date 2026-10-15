# Docker Image Build, Optimization & Push Strategies

This reference guide details containerization patterns for CI/CD: Docker Buildx, BuildKit, GitHub Actions layer caching (`type=gha`), private container registries, multi-architecture builds, and tagging strategies.

---

## 1. Fast, Layer-Cached Docker Builds with Buildx

Docker BuildKit provides parallel build stages and remote layer caching.

### Recommended GitHub Action Setup
```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Log in to Container Registry
  uses: docker/login-action@v3
  with:
    registry: docker-hub.yourdomain.com # Or ghcr.io / docker.io
    username: ${{ secrets.REGISTRY_USERNAME }}
    password: ${{ secrets.REGISTRY_PASSWORD }}

- name: Build and push Docker image
  uses: docker/build-push-action@v6
  with:
    context: .
    file: apps/bot/Dockerfile
    push: true
    platforms: linux/amd64
    build-args: |
      BUILD_ENV=production
      APP_VERSION=${{ github.sha }}
    tags: |
      docker-hub.yourdomain.com/app-bot:${{ github.sha }}
      docker-hub.yourdomain.com/app-bot:latest
    cache-from: type=gha,scope=app-bot
    cache-to: type=gha,mode=max,scope=app-bot
```

---

## 2. Docker Layer Caching (`type=gha`)

GitHub Actions provides built-in cache storage for Docker layers:
- `cache-from: type=gha,scope=${{ inputs.app_name }}`: Reads previously cached layers for this specific service.
- `cache-to: type=gha,mode=max,scope=${{ inputs.app_name }}`: Caches all intermediate layers, not just the final stage.
- **Scope Isolation**: In a monorepo, always specify `scope: <service_name>`. Otherwise, cache writes from one service will evict or overwrite the cache of another service.

---

## 3. Container Registry Authentication

### 3.1 Self-Hosted / Private Registry
```yaml
- name: Log in to private registry
  uses: docker/login-action@v3
  with:
    registry: docker-hub.yourdomain.com
    username: ${{ secrets.REGISTRY_USERNAME }}
    password: ${{ secrets.REGISTRY_PASSWORD }}
```

### 3.2 GitHub Container Registry (GHCR)
Zero external credentials needed; uses native `GITHUB_TOKEN`:
```yaml
- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

### 3.3 Docker Hub
```yaml
- name: Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}
```

---

## 4. Image Tagging Strategies

Always combine **immutable** and **mutable** tags:

| Tag Type | Example | Purpose |
| :--- | :--- | :--- |
| **Git SHA (Immutable)** | `my-app:a1b2c3d` | **Mandatory** for production. Enables instant rollback and exact auditability of running code. |
| **Environment (Mutable)** | `my-app:latest`, `my-app:dev` | Used by server controllers configured for auto-pull or webhooks. |
| **Semantic Version** | `my-app:v1.4.2`, `my-app:v1` | Published on GitHub Releases or milestone tags. |

```yaml
tags: |
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
  ${{ startsWith(github.ref, 'refs/tags/v') && format('{0}/{1}:{2}', env.REGISTRY, env.IMAGE_NAME, github.ref_name) || '' }}
```

---

## 5. Monorepo Dockerfile Best Practices

When building Docker images inside a monorepo (e.g. Bun, pnpm, or npm workspaces):

### 5.1 Context Root
Always set `context: .` to the root of the repository so shared internal packages (`packages/db`, `packages/configs`) can be copied:
```yaml
context: .
file: apps/bot/Dockerfile
```

### 5.2 Proper `.dockerignore`
Ensure node_modules and build artifacts from local development never get copied into the Docker context:
```text
# .dockerignore
**/node_modules
**/.turbo
**/.next
**/dist
**/build
**/.git
**/.env*
!**/.env.example
```

### 5.3 Multi-Stage Dockerfile (Bun Example)
```dockerfile
# 1. Base stage
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# 2. Dependency installation stage
FROM base AS deps
COPY package.json bun.lock turbo.json ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/db/package.json ./packages/db/
RUN bun install --frozen-lockfile --production

# 3. Build / Runtime stage
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY apps/bot ./apps/bot
COPY packages/db ./packages/db

WORKDIR /app/apps/bot
USER bun
EXPOSE 3000

CMD ["bun", "run", "start"]
```
