---
name: grammyjs
description: Build, scale, test, and deploy Telegram bots using the grammY framework in TypeScript and JavaScript (Bun, Node.js, Deno). Use this skill whenever the user asks to build, modify, or debug Telegram bots, work with grammY (or grammyjs), configure bot middleware, filter queries, commands, reactions, menus, sessions, conversations, runner, webhooks, auto-retry, rate limiting, Bot API 7+/8+ features (Telegram Stars, Telegram Business, mini apps, paid media), or deploy to platforms like Bun, Cloudflare Workers, Vercel, Supabase, Docker, or VPS.
---

# grammY Telegram Bot Framework Guide

**grammY** is the modern, type-safe, high-performance Telegram Bot Framework for TypeScript and JavaScript running on Bun, Node.js, and Deno. It features an expressive middleware pipeline, compile-time filter queries, rich context flavoring, and a comprehensive plugin ecosystem.

---

## 1. Quick Navigation & References

For in-depth implementations and specialized workflows, consult the subdocuments in `references/` and starter templates in `examples/`:

- **Core & Context**: [references/core-and-context.md](references/core-and-context.md)
  - Bot instantiation, Context (`ctx`) shortcuts, Context Flavoring (Additive & Synergistic), Onion Middleware, Filter Queries (`bot.on`), Commands, Regex Hears, Reactions, Global Error Handling (`bot.catch`), File Streams (`InputFile`), and Outgoing API Transformers.
- **Plugins Ecosystem**: [references/plugins-guide.md](references/plugins-guide.md)
  - Built-in Keyboards & Sessions, `@grammyjs/conversations` (linear dialogs), `@grammyjs/menu` (interactive inline menus), `@grammyjs/runner` (concurrency), `@grammyjs/auto-retry` (429 backoff), `@grammyjs/transformer-throttler`, `@grammyjs/ratelimiter`, `@grammyjs/hydrate`, `@grammyjs/parse-mode`, `@grammyjs/files`, and `@grammyjs/i18n`.
- **Deployment & Scaling**: [references/deployment-and-scaling.md](references/deployment-and-scaling.md)
  - Long Polling vs. Webhooks, Webhook adapters for Bun, Node.js, Hono, Express, Fastify, Cloudflare Workers, Vercel, Next.js, and Supabase. Webhook security (`secret_token`), graceful shutdown, and modular `Composer` architecture.
- **Bot API 7.x & 8.x Features**: [references/telegram-api-features.md](references/telegram-api-features.md)
  - Telegram Stars (`XTR`) digital goods, paid media (`sendPaidMedia`), paid broadcasts (`allow_paid_broadcast`), Telegram Business integration, message reactions, Mini App (Web App) crypto verification, and forum topic threads.
- **Advanced Patterns & Ecosystem**: [references/advanced-patterns.md](references/advanced-patterns.md)
  - HTML5 Games (`replyWithGame`, `setGameScore`), HTTP/HTTPS/SOCKS5 Proxies (Node, Bun, Deno), Advanced Middleware branching (`Composer.branch`, `bot.filter`), Custom Bot API Transformers, Framework Comparison (vs. Telegraf), and FAQs.

### Starter Templates
- Basic Bot Starter: [examples/basic-bot.ts](examples/basic-bot.ts)
- Sessions & Conversations: [examples/session-conversation-bot.ts](examples/session-conversation-bot.ts)
- Interactive Dynamic Menu: [examples/interactive-menu-bot.ts](examples/interactive-menu-bot.ts)
- High-Speed Webhook on Bun: [examples/webhook-bun.ts](examples/webhook-bun.ts)
- Production Webhook on Node.js / Express: [examples/webhook-node.ts](examples/webhook-node.ts)
- High-Concurrency Runner Bot: [examples/resilient-runner-bot.ts](examples/resilient-runner-bot.ts)

---

## 2. Architecture Decision Matrix

```mermaid
flowchart TD
    Start[New Telegram Bot Request] --> PollingOrWebhook{Deployment Strategy?}
    
    PollingOrWebhook -->|Local dev, VPS, or Docker| PollingMode{Traffic Volume?}
    PollingMode -->|Low-medium traffic| SimplePoll[Use bot.start]
    PollingMode -->|High load / 100+ msg/sec| RunnerPoll[Use @grammyjs/runner + sequentialize]
    
    PollingOrWebhook -->|Serverless, Edge, or Cloud| WebhookMode[Use webhookCallback]
    WebhookMode --> RuntimeCheck{Target Runtime?}
    RuntimeCheck -->|Bun native| BunWH[Bun fetch + webhookCallback 'bun']
    RuntimeCheck -->|Node / Express / Fastify| NodeWH[Express / Fastify + webhookCallback]
    RuntimeCheck -->|Cloudflare Workers / Hono| EdgeWH[Hono / cloudflare-mod adapter]
    
    Start --> InteractionType{Interaction Type?}
    InteractionType -->|Linear question flow| UseConversations[Use @grammyjs/conversations]
    InteractionType -->|Interactive UI buttons & navigation| UseMenu[Use @grammyjs/menu]
    InteractionType -->|Simple command/reply| StandardHandlers[Use bot.command & bot.on]
    
    Start --> StateNeeds{State & Persistence?}
    StateNeeds -->|In-memory dev| MemSession[session with default memory]
    StateNeeds -->|Production persistence| StorageSession[@grammyjs/storage-redis or supabase or prisma]
```

---

## 3. Core Quickstart Cheatsheet

### 3.1 Installation
```bash
# Using Bun
bun add grammy @grammyjs/auto-retry

# Using NPM / PNPM
npm install grammy @grammyjs/auto-retry
```

### 3.2 Strong Typing: Context Flavoring
Always define `MyContext` early to get full autocomplete across plugins:

```typescript
import { Bot, Context, SessionFlavor } from "grammy";
import { type ConversationFlavor } from "@grammyjs/conversations";
import { type HydrateFlavor } from "@grammyjs/hydrate";

export interface SessionData {
  items: string[];
}

export type MyContext = HydrateFlavor<
  Context & SessionFlavor<SessionData> & ConversationFlavor
>;

export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
```

### 3.3 Core Handler Idioms
```typescript
import { InlineKeyboard } from "grammy";

// 1. Commands
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Explore", "btn:explore")
    .url("Documentation", "https://grammy.dev");

  await ctx.reply(`👋 Welcome, ${ctx.from?.first_name}!`, {
    reply_markup: keyboard,
  });
});

// 2. Filter Queries (Compile-time Type Narrowing)
bot.on("message:text", async (ctx) => {
  const userText: string = ctx.msg.text;
  await ctx.reply(`You typed: ${userText}`);
});

// 3. Callback Queries (Inline button presses)
bot.callbackQuery("btn:explore", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Opening explorer..." });
  await ctx.reply("Here is the explorer menu!");
});

// 4. Reactions (Bot API 7.0+)
bot.reaction("👍", async (ctx) => {
  await ctx.reply("Thank you for the reaction!");
});
```

### 3.4 Always Use Auto-Retry in Production
Telegram frequently throws HTTP 429 (`Too Many Requests`) flood waits. The `@grammyjs/auto-retry` plugin delays and retries automatically:

```typescript
import { autoRetry } from "@grammyjs/auto-retry";

bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 60,
}));
```

---

## 4. Critical Rules & Anti-Patterns

### ❌ Anti-Pattern 1: Forgetting `await` on `next()`
```typescript
// BAD: Middleware upstream code executes before downstream finishes
bot.use((ctx, next) => {
  next(); // BUG! Unawaited promise causes race conditions
});

// GOOD:
bot.use(async (ctx, next) => {
  await next();
});
```

### ❌ Anti-Pattern 2: Concurrent Session Races (WAR Hazard)
When updates arrive concurrently (in `@grammyjs/runner` or Webhooks), two updates can read the same session state simultaneously, leading to data loss on write.
```typescript
// BAD: Session installed without sequentialize under concurrent runner
bot.use(session());
run(bot);

// GOOD: Sequentialize updates per chat before reading session
import { run, sequentialize } from "@grammyjs/runner";
const getSessionKey = (ctx: Context) => ctx.chat?.id.toString();

bot.use(sequentialize(getSessionKey));
bot.use(session({ getSessionKey, initial: () => ({}) }));
run(bot);
```

### ❌ Anti-Pattern 3: Unbounded Webhook Execution Time
Telegram expects a 200 OK webhook response within 10-20 seconds. If an operation (AI generation, image resizing, heavy SQL) takes longer, Telegram assumes delivery failed and retries the webhook indefinitely.
- **Rule**: If an operation takes longer than 5 seconds, reply with an immediate acknowledgment ("⏳ Generating your request...") or push the job to an asynchronous queue (BullMQ, Celery, SQS, Cloudflare Queues).

### ❌ Anti-Pattern 4: Non-Deterministic Code in Conversations
`@grammyjs/conversations` re-executes the generator function upon every new update.
```typescript
// BAD: Direct side-effect inside conversation
async function myConversation(conversation, ctx) {
  const result = await fetch("https://api.example.com/charge"); // BUG! Will re-charge on replay!
}

// GOOD: Wrap external calls and side-effects in conversation.external()
async function myConversation(conversation, ctx) {
  const result = await conversation.external(() => fetch("https://api.example.com/charge"));
}
```

### ❌ Anti-Pattern 5: Missing `MyContext` generic on `Composer`
When splitting code into feature files, always provide your custom context generic to `Composer<MyContext>`.
```typescript
// BAD:
const orders = new Composer(); // Uses base Context; session/conversation types lost

// GOOD:
const orders = new Composer<MyContext>();
```

---

## 5. Official Resources & Ecosystem Links

- **Official Website & Documentation**: `https://grammy.dev`
- **Getting Started Guide**: `https://grammy.dev/guide/getting-started`
- **API Reference**: `https://grammy.dev/ref/`
- **Official Plugins Index**: `https://grammy.dev/plugins/`
- **Awesome grammY Community List**: `https://github.com/grammyjs/awesome-grammY`
- **Example Bots Repository**: `https://github.com/grammyjs/examples`
- **Community Chat (English)**: `https://t.me/grammyjs`
