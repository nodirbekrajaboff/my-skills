# Universal Server Controllers & Deployment Targets

This guide covers deployment pipelines for popular server controllers and self-hosted PaaS platforms: **Coolify**, **Portainer**, **CapRover**, and **Direct VPS via SSH (Docker Compose)**.

---

## 1. Coolify

Coolify is an open-source alternative to Heroku/Netlify that supports Git repositories and pre-built Docker images.

### 1.1 Webhook Deployment (Pre-built Image)
In Coolify, configure your application to use Docker Image and copy the Deploy Webhook URL:

```yaml
- name: Deploy via Coolify Webhook
  env:
    COOLIFY_WEBHOOK: ${{ secrets.COOLIFY_WEBHOOK }}
  run: |
    curl --fail-with-body --request POST "$COOLIFY_WEBHOOK"
```

### 1.2 REST API Deployment
Endpoint: `POST /api/v1/deploy?uuid=<APP_UUID>&force=false`
Header: `Authorization: Bearer <API_TOKEN>`

```yaml
- name: Trigger Coolify API Deploy
  run: |
    curl --fail-with-body --silent --show-error \
      --request POST \
      --header "Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}" \
      "${{ secrets.COOLIFY_URL }}/api/v1/deploy?uuid=${{ secrets.COOLIFY_APP_UUID }}&force=false"
```

---

## 2. Portainer

Portainer manages standalone Docker engines and Docker Swarm/Kubernetes clusters.

### 2.1 Stack Webhook Redeploy
Portainer stacks support automated Git / Webhook redeploys:

```yaml
- name: Trigger Portainer Stack Redeploy
  run: |
    curl --fail-with-body --request POST "${{ secrets.PORTAINER_STACK_WEBHOOK_URL }}"
```

### 2.2 Service Webhook (Docker Swarm)
For Docker Swarm services:
```yaml
- name: Update Portainer Swarm Service
  run: |
    curl --fail-with-body --request POST "${{ secrets.PORTAINER_SERVICE_WEBHOOK_URL }}"
```

---

## 3. CapRover

CapRover is an easy-to-use PaaS built on Docker Swarm.

### 3.1 Webhook Deployment
Deploy a pre-built image using CapRover's build webhook:
```yaml
- name: Deploy to CapRover
  run: |
    curl --fail-with-body --request POST \
      "${{ secrets.CAPROVER_WEBHOOK_URL }}&imageToken=${{ env.IMAGE_NAME }}:${{ github.sha }}"
```

---

## 4. Direct VPS Deployment via SSH (Docker Compose)

For instances without a PaaS panel, deploy directly to any VPS running Docker Engine over secure SSH.

### 4.1 Recommended Action: `appleboy/ssh-action`
```yaml
- name: Deploy to VPS over SSH
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    port: ${{ secrets.SERVER_PORT || 22 }}
    script_stop: true # Stop execution on first failed command
    envs: GITHUB_SHA
    script: |
      cd /opt/my-app

      # Export latest image tag
      export IMAGE_TAG=${GITHUB_SHA}

      # Log in to private registry
      echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login ${{ secrets.REGISTRY_URL }} -u "${{ secrets.REGISTRY_USERNAME }}" --password-stdin

      # Pull newly built images
      docker compose pull

      # Up with healthcheck verification
      docker compose up -d --remove-orphans --wait
```

### 4.2 Zero-Downtime `--wait` Flag
Using `docker compose up -d --wait` blocks until all containers report healthy status according to their configured `HEALTHCHECK`. If a container fails to start, the command exits with non-zero, preventing broken releases from remaining active.

### 4.3 Automated Rollback Script
```bash
# Save previous working tag before updating
PREV_TAG=$(docker compose config --images | head -n 1 | cut -d: -f2)

export IMAGE_TAG=${GITHUB_SHA}
if ! docker compose up -d --wait; then
  echo "⚠️ Deployment failed! Rolling back to ${PREV_TAG}..."
  export IMAGE_TAG=${PREV_TAG}
  docker compose up -d --wait
  exit 1
fi
```
