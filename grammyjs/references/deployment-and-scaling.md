# Deployment, Scaling & Production Architecture

This guide covers deployment strategies (Long Polling vs. Webhooks), webhook integrations across major runtimes and frameworks (Bun, Node.js, Hono, Express, Fastify, Cloudflare Workers, Vercel, Supabase), webhook security, and high-concurrency architecture.

---

## 1. Long Polling vs. Webhooks

| Feature | Long Polling (`bot.start()` or `@grammyjs/runner`) | Webhooks (`webhookCallback`) |
| :--- | :--- | :--- |
| **Setup Complexity** | Zero setup (works behind NAT, firewalls, localhost) | Requires public HTTPS domain & SSL certificate |
| **Infrastructure** | Long-running server (VPS, Docker, PM2, Railway) | Serverless (Lambda, Cloudflare, Vercel) or HTTP server |
| **Latency** | Immediate (HTTP long polling keeps connection open) | Immediate (Telegram pushes HTTP POST) |
| **Concurrency** | Managed sequentially or via `@grammyjs/runner` | Handled automatically per incoming HTTP request |
| **Best For** | Development, internal tools, VPS deployments | Production serverless, edge computing, high-scale |

---

## 2. Webhook Adapters by Runtime & Framework

grammY includes official adapters via `webhookCallback(bot, adapter, options)`.

### 2.1 Bun Native Server (`bun:http`)
Bun provides an ultra-fast native HTTP server.

```typescript
import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

// Setup handlers
bot.command("start", (ctx) => ctx.reply("Hello from Bun!"));

const handleWebhook = webhookCallback(bot, "bun", {
  secretToken: process.env.WEBHOOK_SECRET, // Validates X-Telegram-Bot-Api-Secret-Token
});

export default {
  port: Number(process.env.PORT) || 3000,
  fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/webhook" && req.method === "POST") {
      return handleWebhook(req);
    }
    return new Response("OK", { status: 200 });
  },
};
```

---

### 2.2 Hono (Cloudflare Workers, Bun, Node, Deno)
Hono is the modern universal web framework.

```typescript
import { Hono } from "hono";
import { Bot, webhookCallback } from "grammy";

const app = new Hono();
const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("Hello from Hono!"));

app.post(
  "/webhook",
  webhookCallback(bot, "hono", {
    secretToken: process.env.WEBHOOK_SECRET,
  })
);

export default app;
```

---

### 2.3 Express (Node.js)
```typescript
import express from "express";
import { Bot, webhookCallback } from "grammy";

const app = express();
const bot = new Bot(process.env.BOT_TOKEN!);

// CRITICAL: Do NOT use express.json() on the webhook route if using standard grammY callback!
// grammY's express adapter reads the raw request stream.
app.use(
  "/webhook",
  webhookCallback(bot, "express", {
    secretToken: process.env.WEBHOOK_SECRET,
  })
);

app.listen(process.env.PORT || 3000, () => {
  console.log("Server listening on port 3000");
});
```

---

### 2.4 Fastify (Node.js)
```typescript
import Fastify from "fastify";
import { Bot, webhookCallback } from "grammy";

const fastify = Fastify();
const bot = new Bot(process.env.BOT_TOKEN!);

fastify.post(
  "/webhook",
  webhookCallback(bot, "fastify", {
    secretToken: process.env.WEBHOOK_SECRET,
  })
);

await fastify.listen({ port: 3000, host: "0.0.0.0" });
```

---

### 2.5 Cloudflare Workers / Deno / Edge Runtime
```typescript
import { Bot, webhookCallback } from "grammy";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/webhook" && request.method === "POST") {
      const bot = new Bot(env.BOT_TOKEN);
      bot.command("start", (ctx) => ctx.reply("Hello from the Edge!"));

      const handler = webhookCallback(bot, "cloudflare-mod", {
        secretToken: env.WEBHOOK_SECRET,
      });
      return handler(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
```

---

### 2.6 Next.js (App Router Route Handler)
File: `app/api/webhook/route.ts`
```typescript
import { Bot, webhookCallback } from "grammy";

export const dynamic = "force-dynamic";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", (ctx) => ctx.reply("Hello from Next.js!"));

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.WEBHOOK_SECRET,
});
```

---

## 3. Webhook Registration & Security Checklist

### 3.1 Registering the Webhook (`setWebhook`)
Always register webhooks using `secret_token`, `drop_pending_updates`, and explicit `allowed_updates`.

```typescript
// Script: scripts/set-webhook.ts
import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

await bot.api.setWebhook(`${process.env.PUBLIC_DOMAIN}/webhook`, {
  secret_token: process.env.WEBHOOK_SECRET, // 1-256 characters [A-Za-z0-9_-]
  drop_pending_updates: true,               // Ignores updates sent while offline
  allowed_updates: [
    "message",
    "edited_message",
    "callback_query",
    "inline_query",
    "message_reaction",
    "business_message",
  ],
  max_connections: 40,
});

console.log("✅ Webhook configured successfully!");
```

### 3.2 Webhook Rules & Timeouts
1. **Respond Within 10 Seconds**: Telegram times out webhook requests after ~10-20 seconds. If your bot takes longer (AI generation, video encoding, heavy database queries), **acknowledge the update or offload to a background worker/queue (BullMQ, Celery, SQS, Cloudflare Queues)**.
2. **Sequentialize for Sessions in Webhooks**: If multiple updates arrive for the same user in webhooks, concurrent requests can cause Write-After-Read (WAR) session corruption. Use `sequentialize` or atomic database updates.

---

## 4. Graceful Shutdown & Reliability

### Standard Polling Shutdown
```typescript
const bot = new Bot(process.env.BOT_TOKEN!);

// Handles Ctrl+C and container stop
const handleShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Stopping bot gracefully...`);
  await bot.stop();
  process.exit(0);
};

process.once("SIGINT", () => handleShutdown("SIGINT"));
process.once("SIGTERM", () => handleShutdown("SIGTERM"));

bot.start();
```

### Runner Polling Shutdown
```typescript
import { run } from "@grammyjs/runner";

const runner = run(bot);

const stopRunner = () => {
  if (runner.isRunning()) {
    console.log("Stopping grammY runner...");
    runner.stop();
  }
};

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
```

---

## 5. Scaling Up Codebases: The Modular Composer Pattern

For large projects, avoid writing all handlers in one file. Group features into modular `Composer` instances.

### Directory Layout
```text
src/
├── bot.ts                   # Central bot instance & middleware mounting
├── config.ts                # Environment validation
├── context.ts               # Custom context type definition
├── features/                # Domain-specific modules
│   ├── welcome/
│   │   └── index.ts
│   ├── orders/
│   │   ├── index.ts
│   │   └── conversation.ts
│   └── settings/
│       ├── index.ts
│       └── menu.ts
└── services/                # DB, external APIs
```

### Feature Module (`src/features/orders/index.ts`)
```typescript
import { Composer } from "grammy";
import type { MyContext } from "../../context";

export const ordersFeature = new Composer<MyContext>();

ordersFeature.command("orders", async (ctx) => {
  await ctx.reply("Here are your active orders...");
});

ordersFeature.on("callback_query:data", async (ctx, next) => {
  if (!ctx.callbackQuery.data.startsWith("order:")) return next();
  await ctx.answerCallbackQuery({ text: "Processing order..." });
});
```

### Mounting into Bot (`src/bot.ts`)
```typescript
import { Bot } from "grammy";
import type { MyContext } from "./context";
import { ordersFeature } from "./features/orders";
import { settingsFeature } from "./features/settings";
import { welcomeFeature } from "./features/welcome";

export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// Global middlewares (logging, session, i18n, throttler)
bot.use(/* ... */);

// Mount feature composers
bot.use(welcomeFeature);
bot.use(ordersFeature);
bot.use(settingsFeature);
```
