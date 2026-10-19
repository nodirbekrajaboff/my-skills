# Deployment, Scaling, Flood Limits & Hosting Guides

## Table of Contents

1. [Long Polling vs. Webhooks (`guide/deployment-types.md`)](#1-long-polling-vs-webhooks-guidedeployment-typesmd)
2. [Structuring Large Bots (`advanced/structuring.md`)](#2-structuring-large-bots-advancedstructuringmd)
3. [Scaling Up Under High Load (`advanced/scaling.md`)](#3-scaling-up-under-high-load-advancedscalingmd)
4. [Reliability & Graceful Shutdown (`advanced/reliability.md`)](#4-reliability--graceful-shutdown-advancedreliabilitymd)
5. [Rate Limits, Flood Control & Broadcasting (`advanced/flood.md`)](#5-rate-limits-flood-control--broadcasting-advancedfloodmd)
6. [Production Deployment Checklist (`advanced/deployment.md`)](#6-production-deployment-checklist-advanceddeploymentmd)
7. [Hosting Providers Comparison (`hosting/comparison.md`)](#7-hosting-providers-comparison-hostingcomparisonmd)
8. [Platform Hosting Tutorials (`hosting/*.md`)](#8-platform-hosting-tutorials-hostingmd)
   - [8.1 VPS (systemd, PM2, Caddy HTTPS Reverse Proxy, GitHub/GitLab CI/CD)](#81-vps-systemd-pm2-caddy-https-reverse-proxy-githubgitlab-cicd)
   - [8.2 Cloudflare Workers (Node.js Wrangler & Denoflare)](#82-cloudflare-workers-nodejs-wrangler--denoflare)
   - [8.3 Deno Deploy & Supabase Edge Functions](#83-deno-deploy--supabase-edge-functions)
   - [8.4 Vercel Serverless & Edge Functions](#84-vercel-serverless--edge-functions)
   - [8.5 Firebase Functions](#85-firebase-functions)
   - [8.6 Fly.io (Webhooks & Long Polling with Docker)](#86-flyio-webhooks--long-polling-with-docker)
   - [8.7 Heroku (`web` vs `worker` Dynos)](#87-heroku-web-vs-worker-dynos)
   - [8.8 Zeabur (Node.js & Deno)](#88-zeabur-nodejs--deno)

---

## 1. Long Polling vs. Webhooks (`guide/deployment-types.md`)

| Feature | Long Polling (`bot.start()` / `run(bot)`) | Webhooks (`webhookCallback(bot, adapter)`) |
| :--- | :--- | :--- |
| **Mechanism** | Bot actively pulls updates from Telegram in a loop (`getUpdates`). | Telegram pushes updates via HTTPS POST to your endpoint. |
| **Infrastructure** | Requires a continuously running process (VPS, Docker, Fly, Worker Dyno). | Runs on serverless/edge platforms (Cloudflare Workers, Vercel, Deno Deploy, AWS Lambda) or VPS. |
| **Firewall / Domain** | No public IP, domain, or SSL certificate required. | Requires public HTTPS URL (ports `443`, `80`, `88`, or `8443`). |
| **Instance Limit** | **Strictly 1 instance** per bot token (`409 Conflict` if >1). | Scales horizontally across multiple instances/isolates. |
| **Cold Starts & Cost** | Zero cold starts; pays for continuous uptime. | Scales to zero on serverless; supports **Webhook Reply**. |

### Using `webhookCallback` & Supported Framework Adapters

Never call `bot.start()` when running on webhooks! Instead, mount `webhookCallback(bot, adapter, options)` on your web framework:

| Adapter String | Target Web Framework / Runtime |
| :--- | :--- |
| `"express"` (default) | Express (`app.use(express.json())` before route) |
| `"fastify"` | Fastify (`server.post(path, webhookCallback(bot, "fastify"))`) |
| `"hono"` | Hono (`app.post(path, webhookCallback(bot, "hono"))`) |
| `"std/http"` | Deno `Deno.serve`, Supabase Edge Functions, Vercel Edge |
| `"cloudflare-mod"` | Cloudflare Workers ES Modules (`export default { fetch }`) |
| `"cloudflare"` | Cloudflare Workers Service Worker syntax |
| `"bun"` | `Bun.serve` |
| `"http"` / `"https"` | Node.js `http.createServer` / Vercel Node.js Serverless |
| `"koa"` / `"oak"` | Koa (Node.js) / Oak (Deno) |
| `"aws-lambda"` / `"aws-lambda-async"` | AWS Lambda |
| `"next-js"` / `"sveltekit"` / `"elysia"` / `"worktop"` | Next.js Route Handlers, SvelteKit, Elysia, Worktop |

### Pre-setting `botInfo` to Eliminate Serverless Cold-Start `getMe` Calls
On serverless platforms, a new isolate starts frequently. By default, grammY calls `await bot.init()` (`getMe`) before handling the first update. Pass `botInfo` directly to `new Bot(token, { botInfo })` to skip this extra HTTP round-trip:

```ts
const bot = new Bot(process.env.BOT_TOKEN!, {
  botInfo: {
    id: 123456789,
    is_bot: true,
    first_name: "MyBot",
    username: "my_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  },
});
```

### Webhook Reply Optimization
When using webhooks, grammY can embed the **first** API call made during an update (provided it doesn't return a needed result or upload a binary stream) directly into the HTTP response body returned to Telegram (`200 OK`), saving an entire HTTP request round-trip!
- You can customize which methods qualify via `client: { canUseWebhookReply: (method) => method === "sendChatAction" }`.

### Webhook Timeouts (`onTimeout` & `timeoutMilliseconds`)
If your webhook takes too long to respond, Telegram considers delivery failed and **re-sends the exact same update again**, which can cause infinite duplicate execution loops if a slow job is still running!
grammY enforces a built-in webhook timeout (default `10_000` ms):
- `onTimeout: "return"`: Immediately responds `200 OK` to Telegram so Telegram doesn't retry, while letting the middleware finish in the background *(Warning: Serverless platforms like Cloudflare Workers or Vercel may freeze CPU as soon as the HTTP response is returned unless wrapped in `waitUntil`)*.
- `onTimeout: "throw"`: Throws an error when the timeout expires.
- `onTimeout: (args) => { ... }`: Custom callback on timeout.

```ts
const handleUpdate = webhookCallback(bot, "std/http", {
  secretToken: process.env.WEBHOOK_SECRET,
  timeoutMilliseconds: 10_000,
  onTimeout: "return",
});
```

---

## 2. Structuring Large Bots (`advanced/structuring.md`)

As your bot grows, split features into modular files using `Composer<MyContext>` instead of passing `bot` around (which causes circular dependency issues):

```ts
// src/types.ts
import { Context, SessionFlavor } from "grammy";
export interface SessionData { count: number }
export type MyContext = Context & SessionFlavor<SessionData>;

// src/features/admin.ts
import { Composer } from "grammy";
import type { MyContext } from "../types.js";

export const adminComposer = new Composer<MyContext>();
const adminOnly = adminComposer.filter((ctx) => ctx.from?.id === 123456789);

adminOnly.command("stats", async (ctx) => {
  await ctx.reply(`Count: ${ctx.session.count}`);
});

// src/bot.ts
import { Bot, session } from "grammy";
import type { MyContext } from "./types.js";
import { adminComposer } from "./features/admin.js";

export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
bot.use(session({ initial: () => ({ count: 0 }) }));
bot.use(adminComposer);
```

---

## 3. Scaling Up Under High Load (`advanced/scaling.md`)

### Concurrency Is Hard (Write-After-Read Race Conditions)
If a single user or chat sends two messages rapidly and your bot processes them concurrently (either via `@grammyjs/runner` or concurrent webhook requests), both updates may read `session` state `S0`, modify it concurrently, and the second update to finish will overwrite the first update's changes!

### Solution 1: Long Polling with `@grammyjs/runner` + `sequentialize`
Use `run(bot)` for concurrent update processing (up to 500+ in flight) and install `sequentialize(getSessionKey)` **before** `session()` so updates from the *same* chat/user are ordered sequentially while updates from *different* chats run in parallel.

### Solution 2: Webhooks under Heavy Load
Webhooks cannot use in-memory `sequentialize()` across separate serverless instances.
- Keep webhook handlers fast (<500ms) and use transactional database operations (e.g., SQL `UPDATE ... SET count = count + 1`).
- For heavy workloads (video processing, slow LLM chains), have the webhook handler push the `Update` into a message queue (BullMQ, RabbitMQ, Cloudflare Queues) and return `200 OK` immediately, then process updates via `@grammyjs/runner` consumers.

---

## 4. Reliability & Graceful Shutdown (`advanced/reliability.md`)

Never kill your bot process abruptly in production—in-flight updates will be cut off mid-execution and session writes may be lost. Register `SIGINT` and `SIGTERM` signal listeners:

```ts
// 1. Simple Long Polling (bot.start()):
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
// In Deno:
// Deno.addSignalListener("SIGINT", () => bot.stop());
// Deno.addSignalListener("SIGTERM", () => bot.stop());
bot.start();

// 2. Concurrent Runner (run(bot)):
const handle = run(bot);
const stopRunner = () => handle.isRunning() && handle.stop();
process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
```

---

## 5. Rate Limits, Flood Control & Broadcasting (`advanced/flood.md`)

### Official Telegram Bot API Rate Limits
1. **Per Chat**: No more than **1 message per second** inside a particular chat.
2. **Per Group / Supergroup / Channel**: No more than **20 messages per minute** to the same group.
3. **Global Broadcast**: Up to **30 messages per second** across different chats.
4. **Paid Broadcasts (Bot API 7.11+)**: Up to **1,000 messages per second** by enabling Paid Broadcasts in `@BotFather` and passing `{ allow_paid_broadcast: true }` (costs 0.1 Telegram Stars per message over the free 30 msg/sec threshold).

### How to Broadcast Messages Safely
- **NEVER** run `await Promise.all(userIds.map((id) => bot.api.sendMessage(id, text)))`! Sending thousands of requests simultaneously triggers an instant `429 Too Many Requests` flood ban.
- **ALWAYS** install `bot.api.config.use(autoRetry())` (`@grammyjs/auto-retry`).
- Iterate sequentially with a small delay (~35–40ms between messages for ~25–28 msgs/sec) or use `@grammyjs/transformer-throttler`, and gracefully handle `403 Forbidden: bot was blocked by the user` and `chat not found`:

```ts
import { GrammyError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";

bot.api.config.use(autoRetry());

async function broadcast(chatIds: number[], text: string) {
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text);
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        // User blocked the bot; mark inactive in DB
        await markUserBlocked(chatId);
      } else {
        console.error(`Failed to send to ${chatId}:`, err);
      }
    }
    // ~28 messages/sec to stay safely below the 30/sec global limit:
    await new Promise((r) => setTimeout(r, 35));
  }
}
```

---

## 6. Production Deployment Checklist (`advanced/deployment.md`)

1. **Error Handling**: Install `bot.catch()` (and `errorBoundary` where appropriate).
2. **`await` Discipline**: Enable ESLint `@typescript-eslint/no-floating-promises` so no `await next()` or `await ctx.reply()` is ever forgotten.
3. **File Uploads**: Use `new InputFile(...)` for binary uploads; cache and reuse `file_id`s whenever resending static assets.
4. **Flood Retries**: Install `bot.api.config.use(autoRetry())`.
5. **Graceful Shutdown**: Hook `SIGINT` and `SIGTERM` to `bot.stop()` or `runner.stop()`.
6. **Concurrency**: If using `run(bot)` or `conversations()`, install `sequentialize()` before `session()`.
7. **Server Location**: Deploy close to **Amsterdam, Netherlands** (`ams`, `eu-west`, `fra`).

---

## 7. Hosting Providers Comparison (`hosting/comparison.md`)

- **Serverless / Edge (Requires Webhooks; No Persistent Disk)**:
  - **Cloudflare Workers**: Free tier (100k req/day), up to 30s CPU time, supports Node.js (`wrangler`) & Deno (`denoflare`).
  - **Deno Deploy**: Free tier (1M req/mo), native Deno + GitHub integration.
  - **Supabase Edge Functions**: Built on Deno runtime; pairs seamlessly with Supabase Postgres/Auth.
  - **Vercel**: Free tier, 10s limit on Hobby Serverless (`"https"` adapter) or Edge Functions (`"std/http"` adapter).
  - **Firebase Functions**: Google Cloud Functions integration (`functions.https.onRequest(webhookCallback(bot))`).
- **PaaS & Containers (Supports Webhooks OR Long Polling)**:
  - **Fly.io**: Supports Amsterdam (`ams`) region, Docker/Deno/Node.js, Webhooks or Long Polling.
  - **Heroku**: Use `web:` dyno for Webhooks (sleeps on Eco plan) or `worker:` dyno for Long Polling (does not sleep on web inactivity).
  - **Zeabur**: Zero-config GitHub or CLI deployment (`npx @zeabur/cli deploy`) for Node.js & Deno.
- **VPS (Full Linux Control; Lowest Latency to Amsterdam)**:
  - **DigitalOcean** (AMS 1–15ms), **Hetzner Cloud** (DE ~42ms), **Netcup** (DE 8ms / NL 15ms), **MVPS** (DE 6–9ms), **IONOS** (DE 15ms), **Hostinger**.

---

## 8. Platform Hosting Tutorials (`hosting/*.md`)

### 8.1 VPS (systemd, PM2, Caddy HTTPS Reverse Proxy, GitHub/GitLab CI/CD)

#### Option A: Running with `systemd` (`/etc/systemd/system/my-bot.service`)
```ini
[Unit]
Description=Telegram Bot
After=network.target

[Service]
WorkingDirectory=/home/botuser/my-bot
ExecStart=/usr/bin/node /home/botuser/my-bot/dist/bot.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
Manage with:
```sh
systemctl daemon-reload
systemctl enable my-bot.service
systemctl start my-bot.service
journalctl -u my-bot.service -f
```

#### Option B: Running with `PM2` (`ecosystem.config.js`)
```js
module.exports = {
  apps: [{
    name: "my-bot",
    script: "node dist/bot.js",
  }],
};
```
```sh
pm2 start
pm2 startup # Run the printed command to enable boot persistence
pm2 save
```

#### Option C: Webhooks on VPS with Caddy (Auto-HTTPS Reverse Proxy)
Configure `/etc/caddy/Caddyfile` to reverse-proxy `https://<domain>/<bot_token>` to your local bot port:
```caddyfile
bot.example.com {
  reverse_proxy /<BOT_TOKEN> localhost:3000
}
```
Reload Caddy (`systemctl reload caddy`) and register the webhook:
`https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://bot.example.com/<BOT_TOKEN>`

#### Automated CI/CD to VPS via SSH (`rsync`)
Use `easingthemes/ssh-deploy@v4` in GitHub Actions (or `rsync` + `ssh` in GitLab CI) with secrets `SSH_PRIVATE_KEY`, `REMOTE_HOST`, and `REMOTE_USER` to copy `dist/ package.json package-lock.json` and run `npm i --omit=dev && systemctl restart my-bot` on push to `main`.

---

### 8.2 Cloudflare Workers (Node.js Wrangler & Denoflare)

#### Node.js / Wrangler (`hosting/cloudflare-workers-nodejs.md`)
1. Initialize via `npm create cloudflare@latest` and `npm install grammy`.
2. Add `BOT_INFO` JSON string to `wrangler.toml` under `[vars]` (obtained once from `https://api.telegram.org/bot<TOKEN>/getMe`) and store `BOT_TOKEN` securely via `npx wrangler secret put BOT_TOKEN` (and in `.dev.vars` for local `npm run dev`).
3. In `src/index.ts`:
   ```ts
   import { Bot, Context, webhookCallback } from "grammy";

   export interface Env {
     BOT_INFO: string;
     BOT_TOKEN: string;
   }

   export default {
     async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
       const bot = new Bot(env.BOT_TOKEN, { botInfo: JSON.parse(env.BOT_INFO) });

       bot.command("start", async (ctx: Context) => {
         await ctx.reply("Hello from Cloudflare Workers!");
       });

       return webhookCallback(bot, "cloudflare-mod")(request);
     },
   };
   ```
4. Deploy with `npm run deploy` and call `setWebhook` pointing to `https://<worker>.<subdomain>.workers.dev/`.

#### Deno / Denoflare (`hosting/cloudflare-workers.md`)
Uses `.denoflare` config with `webhookCallback(bot, "cloudflare-mod")` and caches `botInfo` in a module-scoped `let botInfo: UserFromGetMe | undefined` variable. Deploy via `denoflare push my-bot`.

---

### 8.3 Deno Deploy & Supabase Edge Functions

#### Deno Deploy (`hosting/deno-deploy.md`)
```ts
import { webhookCallback } from "npm:grammy";
import bot from "./bot.ts";

const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === bot.token) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error(err);
      }
    }
  }
  return new Response();
});
```
Deploy via GitHub integration or `deployctl deploy --project=<project> --entrypoint=./main.ts --prod`.

#### Supabase Edge Functions (`hosting/supabase.md`)
1. Create function: `supabase functions new telegram-bot`
2. Use `webhookCallback(bot, "std/http")` inside `Deno.serve` checking `url.searchParams.get("secret") === bot.token`.
3. Deploy with `--no-verify-jwt` (critical because Telegram does not send Supabase JWTs!):
   ```sh
   supabase functions deploy --no-verify-jwt telegram-bot
   supabase secrets set BOT_TOKEN=123456:ABC-DEF
   ```
4. Set webhook to `https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot?secret=<BOT_TOKEN>`.

---

### 8.4 Vercel Serverless & Edge Functions (`hosting/vercel.md`)

Place your handler in `api/bot.ts` and configure `vercel.json`:
```ts
// Node.js Serverless Runtime (api/bot.ts):
import { Bot, webhookCallback } from "grammy";
const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", (ctx) => ctx.reply("Running on Vercel!"));
export default webhookCallback(bot, "https");

// OR Vercel Edge Runtime (api/bot.ts):
export const config = { runtime: "edge" };
export default webhookCallback(bot, "std/http");
```
Set webhook to `https://<app-name>.vercel.app/api/bot`.

---

### 8.5 Firebase Functions (`hosting/firebase.md`)

```ts
import * as functions from "firebase-functions";
import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", (ctx) => ctx.reply("Welcome from Firebase!"));

// Default adapter for webhookCallback(bot) is "express", which matches Firebase onRequest!
export const helloWorld = functions.https.onRequest(webhookCallback(bot));
```
Deploy via `firebase deploy` and set webhook to `https://<REGION>-<PROJECT_ID>.cloudfunctions.net/helloWorld`.

---

### 8.6 Fly.io (`hosting/fly.md`)

Supports both **Webhooks** (with `[[services]]` on `internal_port = 8000`) and **Long Polling** (omit `[[services]]` entirely in `fly.toml` since no HTTP port is needed!).
- Store token via `flyctl secrets set BOT_TOKEN="..."`.
- Configure `kill_signal = "SIGINT"` and `kill_timeout = 5` in `fly.toml` with `process.once("SIGINT", () => bot.stop())`.
- Choose region `ams` (Amsterdam) when running `flyctl launch`.

---

### 8.7 Heroku (`hosting/heroku.md`)

Define a `Procfile` (no extension) at project root:
- **For Webhooks**: `web: node dist/app.js` (listens on `Number(process.env.PORT)` via Express).
- **For Long Polling**: `worker: node dist/bot.js` (uses a `worker` dyno so Heroku does not time out after 30s or put the dyno to sleep on HTTP inactivity).

---

### 8.8 Zeabur (`hosting/zeabur-nodejs.md` & `hosting/zeabur-deno.md`)

Supports both Node.js and Deno out of the box via GitHub repository connection or `npx @zeabur/cli deploy`. Configure `TELEGRAM_BOT_TOKEN` in the Zeabur Variables tab.
