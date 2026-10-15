# Dokploy Deployments: Webhooks, REST API & Compose Management

**Dokploy** is an open-source, self-hosted Platform as a Service (PaaS) built on top of Docker and Traefik. This guide details how to trigger and verify Dokploy deployments from GitHub Actions using both **Webhooks** and the **Dokploy REST API**.

---

## 1. Webhook vs. REST API Deployments

| Method | Best For | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Deploy Webhook** | Standard apps, workers, bots | • Simple one-liner `curl`<br>• No API token needed | • Fire-and-forget (doesn't wait for completion) |
| **REST API + Polling** | Database migrations, seeds, sequential services | • Synchronous verification<br>• Fails CI step if container crashes<br>• Status feedback | • Requires API token & Compose/App ID |

---

## 2. Deploy Webhooks (Fire-and-Forget)

Dokploy generates a unique deploy webhook URL for every application and compose stack.

### 2.1 Triggering a Webhook from GitHub Actions
Store the webhook URL in GitHub Repository Secrets (e.g., `DOKPLOY_BOT_WEBHOOK`).

```yaml
- name: Trigger Dokploy deploy webhook
  env:
    DOKPLOY_WEBHOOK: ${{ secrets.DOKPLOY_BOT_WEBHOOK }}
  run: |
    curl --fail-with-body --request POST "$DOKPLOY_WEBHOOK"
```

### 2.2 Best Practice Flags
- `--fail-with-body`: If the server returns a 4xx or 5xx status code, curl prints the response body from Dokploy and exits with an error code, failing the CI job instead of silently continuing.

---

## 3. Dokploy REST API Deployment (Synchronous with Polling)

For database migrations, seeds, or jobs where the next CI step depends on success, trigger deployment via the Dokploy API and poll for status.

### 3.1 Required Secrets
- `DOKPLOY_URL`: The base URL of your Dokploy instance (e.g., `https://dokploy.yourdomain.com`).
- `DOKPLOY_API_TOKEN`: Created in Dokploy under **Settings > API Tokens**.
- `DOKPLOY_MIGRATOR_COMPOSE_ID` or `DOKPLOY_APP_ID`: The unique identifier found in Dokploy's URL or settings.

### 3.2 Triggering API Redeployment
Endpoint: `POST /api/compose.redeploy` (or `/api/application.deploy`)
Header: `x-api-key: ${DOKPLOY_API_TOKEN}`

```yaml
- name: Trigger Dokploy deployment
  run: |
    curl --fail-with-body --silent --show-error \
      --request POST \
      --header "Content-Type: application/json" \
      --header "x-api-key: ${{ secrets.DOKPLOY_API_TOKEN }}" \
      --data "{\"composeId\":\"${{ secrets.DOKPLOY_MIGRATOR_COMPOSE_ID }}\",\"title\":\"Deployment ${{ github.sha }}\"}" \
      "${{ secrets.DOKPLOY_URL }}/api/compose.redeploy"
```

### 3.3 Status Polling Loop
After triggering redeploy, poll `/api/compose.one` until status is `done` or `error`:

```yaml
- name: Wait for deployment completion
  timeout-minutes: 5
  env:
    DOKPLOY_URL: ${{ secrets.DOKPLOY_URL }}
    DOKPLOY_API_TOKEN: ${{ secrets.DOKPLOY_API_TOKEN }}
    COMPOSE_ID: ${{ secrets.DOKPLOY_MIGRATOR_COMPOSE_ID }}
  run: |
    sleep 5
    # Poll up to 36 times (36 * 5s = 180 seconds)
    for attempt in $(seq 1 36); do
      response=$(curl --fail-with-body --silent --show-error \
        --header "x-api-key: ${DOKPLOY_API_TOKEN}" \
        "${DOKPLOY_URL%/}/api/compose.one?composeId=${COMPOSE_ID}")
      
      status=$(jq --raw-output '.composeStatus // empty' <<<"$response")

      echo "Deployment status: ${status:-unknown} (attempt ${attempt}/36)"

      case "$status" in
        done)
          echo "✅ Deployment finished successfully!"
          exit 0
          ;;
        error)
          echo "❌ Deployment failed on Dokploy server. Check Dokploy logs!"
          exit 1
          ;;
        idle|running|"")
          sleep 5
          ;;
        *)
          echo "⚠️ Unexpected status received: $status"
          exit 1
          ;;
      esac
    done

    echo "⏱️ Timed out waiting for deployment."
    exit 1
```

---

## 4. Multi-Environment Stacks (Dev vs. Prod)

Use GitHub Actions environment expressions to route deployments to the correct Dokploy stack:

```yaml
env:
  DOKPLOY_COMPOSE_ID: ${{ github.ref == 'refs/heads/main' && secrets.DOKPLOY_PROD_COMPOSE_ID || secrets.DOKPLOY_DEV_COMPOSE_ID }}
```

---

## 5. Zero-Downtime Rolling Updates on Dokploy

To achieve zero downtime during application upgrades:
1. **Docker Healthchecks**: Define `HEALTHCHECK` in your `Dockerfile` or `docker-compose.yml`.
2. **Traefik Integration**: Dokploy routes traffic through Traefik. When a healthcheck is defined, Traefik only cuts over traffic to the new container once the healthcheck passes.
3. **Stop Grace Period**: Ensure your application handles `SIGTERM` and finishes processing active requests before shutting down (`stop_grace_period: 30s`).
