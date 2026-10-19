---
name: grammyjs
description: Comprehensive guide and reference for building, structuring, scaling, and deploying Telegram Bots using the grammY framework (`grammy` and `@grammyjs/*` plugins) in TypeScript and JavaScript across Node.js, Deno, Bun, and Serverless/Edge platforms. Trigger this skill whenever the user creates, modifies, debugs, or asks about a Telegram bot using grammY, `@grammyjs/conversations` (v2), `@grammyjs/menu`, `@grammyjs/runner`, `@grammyjs/commands`, `@grammyjs/parse-mode` (`fmt` / `FormattedString`), `@grammyjs/i18n`, `@grammyjs/hydrate`, `@grammyjs/stream`, `@grammyjs/chat-members`, `@grammyjs/files`, `@grammyjs/auto-retry`, Telegram Stars (`XTR`), Business Bots, Mini Apps (`WebApp`), Inline Queries, Filter Queries, Sessions, or Webhooks.
---

# grammY — The Telegram Bot Framework Skill

This skill provides complete, up-to-date architectural guidance, official plugin patterns, and deployment recipes for **grammY** (`grammy`), derived directly from the complete official documentation (`site/docs/guide`, `advanced`, `plugins`, `hosting`, and `resources`).

---

## 1. Progressive Disclosure & Reference Navigation

Load the specific reference file matching your current task:

### Reference Manuals (`references/`)
- **[`references/core-and-context.md`](references/core-and-context.md)**:
  Read when working with `Bot`, `Context` (`ctx`) and all 10 shortcuts (`ctx.msg`, `ctx.chatId`, `ctx.entities()`, `ctx.reactions()`, etc.), `ctx.has*` / `Context.has` probing, Context Flavors (Additive `&` vs Transformative `Flavor<C>`), Filter Queries (`L1:L2:L3`, omissions like `::url`, 5 sender types, `matchFilter`, `Filter<C, Q>`), Commands & Deep Linking, Middleware stack, Reactions (`ctx.react`, `bot.reaction`), Error Handling (`BotError`, `GrammyError`, `HttpError`, `errorBoundary`), Files (`file_id`, `InputFile`, Local Bot API Server), and HTML5 Games.
- **[`references/plugins-guide.md`](references/plugins-guide.md)**:
  Read when using any **Built-in** (`session`, `lazySession`, `enhanceStorage`, `InlineKeyboard`, `Keyboard`, `InputMediaBuilder`, `InlineQueryResultBuilder`), **Official** (`conversations` v2, `menu`, `runner`, `commands`, `parse-mode` v2, `stream`, `i18n`, `fluent`, `chat-members`, `hydrate`, `files`, `auto-retry`, `transformer-throttler`, `ratelimiter`, `emoji`, `router`, `stateless-question`), or **Third-Party** (`telegraf-middleware-console-time`, `grammy-middlewares`, `@roziscoding/grammy-autoquote`, `@qz/telegram-entities-parser`) plugin, or when authoring custom plugins.
- **[`references/deployment-and-scaling.md`](references/deployment-and-scaling.md)**:
  Read when choosing between Long Polling (`bot.start()` / `run(bot)`) and Webhooks (`webhookCallback`), structuring large codebases with `Composer`, preventing race conditions with `sequentialize`, broadcasting safely under flood limits, handling graceful shutdown (`SIGINT`/`SIGTERM`), or deploying to **VPS** (`systemd`, `PM2`, `Caddy`, CI/CD), **Cloudflare Workers** (Node.js & Deno), **Deno Deploy**, **Supabase Edge Functions**, **Vercel**, **Firebase Functions**, **Fly.io**, **Heroku**, or **Zeabur**.
- **[`references/advanced-patterns.md`](references/advanced-patterns.md)**:
  Read when working with Middleware Trees (`Composer` branching, `filter`, `drop`, `fork`, `lazy`), Outbound API Transformers (`bot.api.config.use`, `ctx.api.config.use`, API Flavoring), **Telegram Business** connections & customer chats, HTTP/SOCKS5 Proxies, framework comparisons (grammY vs Telegraf/NTBA), or troubleshooting Telegram error codes (`400`, `401`, `403`, `404`, `409`, `429`).
- **[`references/telegram-api-features.md`](references/telegram-api-features.md)**:
  Read when implementing **Telegram Stars (`XTR`)** payments/subscriptions/refunds, **Paid Media** (`sendPaidMedia`), **Paid Broadcasts** (`allow_paid_broadcast`), **Message Effects**, **Quotes**, **Telegram Mini Apps (`WebApp`)** with cryptographic `initData` HMAC verification, or **Forum Topics**.

### Starter Templates (`examples/`)
- **[`examples/basic-bot.ts`](examples/basic-bot.ts)**: Core `Bot`, timing middleware, `InlineKeyboard`, reactions, and `bot.catch()`.
- **[`examples/session-conversation-bot.ts`](examples/session-conversation-bot.ts)**: **Conversations 2.0** (`ConversationFlavor`, separate outside/inside contexts, `conversation.form`, `conversation.external`, versioned storage) + `session()`.
- **[`examples/interactive-menu-bot.ts`](examples/interactive-menu-bot.ts)**: `@grammyjs/menu` hierarchy with `.dynamic()`, button payloads, `ctx.menu.update()`, and `ctx.menu.close()`.
- **[`examples/resilient-runner-bot.ts`](examples/resilient-runner-bot.ts)**: High-load `@grammyjs/runner` + `sequentialize` + `autoRetry` + `ratelimiter` + graceful shutdown.
- **[`examples/inline-query-bot.ts`](examples/inline-query-bot.ts)**: `InlineQueryResultBuilder`, offset pagination, switch-to-PM button, and `chosenInlineResult`.
- **[`examples/webhook-node.ts`](examples/webhook-node.ts)**: Express webhook server (`express.json()` + `webhookCallback(bot, "express")`).
- **[`examples/webhook-bun.ts`](examples/webhook-bun.ts)**: Native `Bun.serve` webhook server (`webhookCallback(bot, "bun")`).

---

## 2. Architecture & Runtime Decision Matrix

| Scenario | Recommended Mode | Key Packages / API |
| :--- | :--- | :--- |
| **Local dev / low-traffic VPS bot** | Simple Long Polling | `bot.start()` (built-in) |
| **High-traffic VPS / Docker / Worker bot** | Concurrent Long Polling | `@grammyjs/runner` (`run(bot)`) + `sequentialize()` |
| **CPU-intensive long-polling bot** | Multithreaded Runner | `@grammyjs/runner` (`BotWorker` + `distribute()`) |
| **Serverless / Edge (Cloudflare, Vercel, Deno Deploy, Supabase)** | Webhooks (Stateless HTTP) | `webhookCallback(bot, adapter)` + `new Bot(token, { botInfo })` |
| **Webhooks with heavy background jobs (>5s)** | Webhook → Queue → Worker | Return `200 OK` fast; process via Queue + `@grammyjs/auto-retry` |

---

## 3. Complete Plugin Ecosystem Matrix

| Category | Plugin / Feature | Import / Package | Registration & Context/API Flavor |
| :--- | :--- | :--- | :--- |
| **Built-in** | Sessions | `grammy` (`session`, `lazySession`, `enhanceStorage`) | `bot.use(session(...))` • `SessionFlavor<T>` / `LazySessionFlavor<T>` |
| **Built-in** | Keyboards | `grammy` (`InlineKeyboard`, `Keyboard`) | Pass in `{ reply_markup: keyboard }` |
| **Built-in** | Media Groups | `grammy` (`InputMediaBuilder`) | `ctx.replyWithMediaGroup([InputMediaBuilder.photo(...)])` |
| **Built-in** | Inline Queries | `grammy` (`InlineQueryResultBuilder`) | `ctx.answerInlineQuery([InlineQueryResultBuilder.article(...)])` |
| **Official** | Conversations 2.0 | `@grammyjs/conversations` | `bot.use(conversations())` + `bot.use(createConversation(fn))` • `ConversationFlavor<C>` |
| **Official** | Interactive Menus | `@grammyjs/menu` | `bot.use(menu)` • `MenuFlavor` (automatic on handlers) |
| **Official** | Runner | `@grammyjs/runner` | `bot.use(sequentialize(fn))` + `run(bot)` |
| **Official** | Commands | `@grammyjs/commands` | `bot.use(commands())` + `bot.use(commandGroup)` • `CommandsFlavor<C>` |
| **Official** | Parse Mode (v2) | `@grammyjs/parse-mode` | `fmt` tag & `FormattedString` class (passes `.text` & `.entities`) |
| **Official** | Stream (LLM/AI) | `@grammyjs/stream` | `bot.use(stream())` • `StreamFlavor<C>` (`ctx.replyWithStream`) |
| **Official** | I18n (Fluent) | `@grammyjs/i18n` (or `@grammyjs/fluent`) | `bot.use(i18n)` • `I18nFlavor` (`ctx.t("key", vars)`) |
| **Official** | Chat Members | `@grammyjs/chat-members` | `bot.use(chatMembers(adapter))` / `chatMemberFilter()` • `ChatMembersFlavor` |
| **Official** | Hydrate | `@grammyjs/hydrate` | `bot.use(hydrate())` (or `hydrateContext` + `hydrateApi`) • `HydrateFlavor<C>` |
| **Official** | Files | `@grammyjs/files` | `bot.api.config.use(hydrateFiles(bot.token))` • `FileFlavor<C>`, `FileApiFlavor<Api>` |
| **Official** | Auto-Retry | `@grammyjs/auto-retry` | `bot.api.config.use(autoRetry())` (Outbound API Transformer) |
| **Official** | Throttler | `@grammyjs/transformer-throttler` | `bot.api.config.use(apiThrottler())` (Outbound API Transformer) |
| **Official** | Rate Limiter | `@grammyjs/ratelimiter` | `bot.use(limit({ timeFrame, limit, storageClient }))` |
| **Official** | Emoji | `@grammyjs/emoji` | `bot.use(emojiParser())` • `EmojiFlavor<C>` (`ctx.emoji`, `Reactions`) |
| **Official** | Router | `@grammyjs/router` | `bot.use(router)` (`new Router((ctx) => key)`) |
| **Official** | Stateless Question | `@grammyjs/stateless-question` | `bot.use(q.middleware())` (`new StatelessQuestion("id", fn)`) |
| **Official** | Free Storage | `@grammyjs/storage-free` | `freeStorage<SessionData>(bot.token)` |
| **3rd-Party** | Console Time | `telegraf-middleware-console-time` | `bot.use(generateUpdateMiddleware())` |
| **3rd-Party** | Middlewares | `grammy-middlewares` | `ignoreOld()`, `onlyAdmin()`, `onlyPublic()`, `onlySuperAdmin()` |
| **3rd-Party** | Autoquote | `@roziscoding/grammy-autoquote` | `bot.use(autoQuote())` or `ctx.api.config.use(addReplyParam(ctx))` |
| **3rd-Party** | Entity Parser | `@qz/telegram-entities-parser` | `new EntitiesParser().parse({ message: ctx.msg })` (for web HTML outside Telegram) |

---

## 4. Quickstart & Canonical Patterns

### Pattern A: Combining Additive & Transformative Context Flavors
Additive flavors (`SessionFlavor`, `I18nFlavor`, `ChatMembersFlavor`) are intersected with `&`. Transformative flavors (`ConversationFlavor`, `HydrateFlavor`, `FileFlavor`, `EmojiFlavor`, `CommandsFlavor`, `StreamFlavor`) wrap the type parameter `Flavor<...>`:

```ts
import { Api, Bot, Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { FileApiFlavor, FileFlavor } from "@grammyjs/files";
import { HydrateApiFlavor, HydrateFlavor } from "@grammyjs/hydrate";
import { I18nFlavor } from "@grammyjs/i18n";

interface SessionData { step: number }

// 1. Intersect additive flavors first:
type BaseContext = Context & SessionFlavor<SessionData> & I18nFlavor;

// 2. Wrap with transformative flavors:
export type MyContext = ConversationFlavor<FileFlavor<HydrateFlavor<BaseContext>>>;
export type MyApi = FileApiFlavor<HydrateApiFlavor<Api>>;

const bot = new Bot<MyContext, MyApi>(process.env.BOT_TOKEN!);
```

### Pattern B: Recommended Middleware Registration Order
```ts
// 1. Outbound API Transformers
bot.api.config.use(autoRetry());
bot.api.config.use(hydrateFiles(bot.token));

// 2. Concurrency Lock (MUST come BEFORE session and conversations!)
bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

// 3. Inbound Spam Protection
bot.use(limit({ timeFrame: 1000, limit: 3 }));

// 4. State & Context Hydration Plugins
bot.use(session({ initial: () => ({ step: 0 }) }));
bot.use(i18n);
bot.use(hydrate());
bot.use(conversations());

// 5. Interactive Menus & Active Conversations (before general message handlers)
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exitAll();
  await ctx.reply("Cancelled active dialog.");
});
bot.use(settingsMenu);
bot.use(createConversation(onboardingConversation));

// 6. Specific Command, Hears, CallbackQuery & Filter Query Handlers
bot.command("start", (ctx) => ctx.reply("Welcome!"));
bot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.msg.text}`));
bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery()); // Catch-all

// 7. Global Error Handler
bot.catch((err) => console.error(`Update ${err.ctx.update.update_id} failed:`, err.error));
```

---

## 5. Critical Rules & Anti-Patterns Checklist

1. **ALWAYS `await` `next()` and API Calls**:
   Never call `next()` or `ctx.reply()` without `await` (or `return`). Unawaited promises break middleware ordering, cause `session()` to save stale data before downstream handlers finish, break `@grammyjs/runner` backpressure, and cause serverless webhooks to terminate before sending messages.
2. **Conversations 2.0 Context Separation & `conversation.external()`**:
   - In `@grammyjs/conversations` v2, outside context (`MyContext = ConversationFlavor<Context>`) and inside context (`MyConversationContext = Context`) are **separate types** (`Conversation<MyContext, MyConversationContext>`).
   - Wrap ALL side effects (DB queries, `fetch`, file I/O, and `ctx.session` access) inside `await conversation.external(...)`. Use `await conversation.random()`, `await conversation.now()`, and `await conversation.sleep(ms)` instead of native `Math.random()`, `Date.now()`, or `setTimeout`.
   - Plugins needed inside a conversation must be passed to `createConversation(fn, { plugins: [...] })`.
3. **Never Invent `@grammyjs/media-group`**:
   Media groups are **built-in** to `grammy` via `InputMediaBuilder` (`InputMediaBuilder.photo(...)`, `ctx.replyWithMediaGroup([...])`). There is no external `@grammyjs/media-group` package.
4. **Use `@grammyjs/parse-mode` v2 (`fmt` & `FormattedString`)**:
   Do not use v1 `parseMode("HTML")` or `html` tags. Use `import { b, code, fmt, FormattedString } from "@grammyjs/parse-mode"` and pass `{ entities: message.entities }` (or `{ caption: fmtStr.caption, caption_entities: fmtStr.caption_entities }`) to eliminate `400 Bad Request: Cannot parse entities` errors permanently.
5. **Use `CommandGroup` in `@grammyjs/commands`**:
   Register commands with `const myCommands = new CommandGroup()`, `myCommands.command("name", "desc", handler)`, `.localize(...)`, `.addToScope(...)`, and sync via `await myCommands.setCommands(bot)`.
6. **Install `sequentialize` BEFORE `session`**:
   When using `@grammyjs/runner` (`run(bot)`), always register `bot.use(sequentialize(getKey))` **before** `bot.use(session(...))` using the exact same session key function to prevent Write-After-Read race conditions.
7. **Register Menus & Conversations BEFORE Catch-All Handlers**:
   Always register `bot.use(rootMenu)` and `bot.use(createConversation(...))` before generic `bot.on("message")` or `bot.on("callback_query:data")` handlers so they aren't swallowed.
8. **Enable `allowed_updates` for `chat_member` and `message_reaction`**:
   Telegram does **not** send `chat_member`, `message_reaction`, or `message_reaction_count` updates by default. Explicitly pass `allowed_updates: [...API_CONSTANTS.DEFAULT_UPDATE_TYPES, "chat_member", "message_reaction"]` (or `API_CONSTANTS.ALL_UPDATE_TYPES`) to `bot.start()`, `run(bot)`, or `setWebhook()`.
9. **Express Webhooks Require `app.use(express.json())`**:
   When using `webhookCallback(bot, "express")`, always mount `app.use(express.json())` before the webhook route. Never call `bot.start()` when using webhooks.
10. **Pre-set `botInfo` on Serverless/Edge Runtimes**:
    Pass `{ botInfo }` to `new Bot(token, { botInfo })` on Cloudflare Workers, Vercel, Deno Deploy, and Supabase Edge Functions to eliminate an extra `getMe` HTTP request on every cold start.
11. **Supabase Edge Functions Require `--no-verify-jwt`**:
    When deploying a Telegram webhook to Supabase Edge Functions, always deploy with `supabase functions deploy --no-verify-jwt <fn>` because Telegram does not send a Supabase JWT header.
12. **Distinguish Business Owner vs. Customer in `business_message`**:
    In Telegram Business chats, your bot receives `business_message` updates from **both** the business owner and their customer. Check `ctx.from.id === (await ctx.getBusinessConnection()).user.id` so the bot doesn't reply to the business owner as if they were a customer.
