# Advanced Patterns: Middleware Trees, API Transformers, Business, Proxies & FAQ

## Table of Contents

1. [Middleware Redux: Tree Topology & `Composer` Methods (`advanced/middleware.md`)](#1-middleware-redux-tree-topology--composer-methods-advancedmiddlewaremd)
2. [Bot API Transformers & API Flavoring (`advanced/transformers.md`)](#2-bot-api-transformers--api-flavoring-advancedtransformersmd)
3. [Telegram Business Bots (`advanced/business.md`)](#3-telegram-business-bots-advancedbusinessmd)
4. [Proxy Support Across Runtimes (`advanced/proxy.md`)](#4-proxy-support-across-runtimes-advancedproxymd)
5. [Framework & Language Comparisons (`resources/comparison.md`)](#5-framework--language-comparisons-resourcescomparisonmd)
6. [Troubleshooting & Official FAQ (`resources/faq.md`)](#6-troubleshooting--official-faq-resourcesfaqmd)

---

## 1. Middleware Redux: Tree Topology & `Composer` Methods (`advanced/middleware.md`)

### Why Middleware in grammY Forms a Tree (Not a Flat Array)
In Express/Koa, `app.use(a).use(b)` chains middleware on the same root object. In grammY, `Bot` extends `Composer`, and **every method call on `Composer` (`use`, `on`, `command`, `filter`, `drop`, `fork`, `errorBoundary`) returns a NEW child `Composer` instance** that only executes when the parent condition matched!

```ts
// Compare these two patterns:

// Pattern 1: Chained (forms a vertical branch; C only runs if B calls next() AND A matched):
bot.on(":text", A).use(B).use(C);

// Pattern 2: Sibling registration on `bot` (A, B, and C are siblings under `bot`):
bot.on(":text", A);
bot.use(B);
bot.use(C);
```

Because each `.on()` or `.filter()` returns a child `Composer`, you can capture that child in a variable to create scoped sub-trees without repeating predicates:

```ts
// Create a branch that ONLY runs in group or supergroup chats:
const groups = bot.chatType(["group", "supergroup"]);

// Everything registered on `groups` is automatically restricted to groups/supergroups!
groups.command("rules", (ctx) => ctx.reply("Group rules..."));
groups.on(":new_chat_members", (ctx) => ctx.reply("Welcome to the group!"));
```

### Advanced `Composer` Control-Flow Methods

| Method | Behavior |
| :--- | :--- |
| `bot.on(query, ...mw)` | Narrows `ctx` via `FilterQuery` and runs `mw` only if matched. |
| `bot.filter(pred, ...mw)` | Runs `mw` if `pred(ctx)` returns `true` (supports async predicates AND TypeScript type predicates `(ctx): ctx is NarrowedCtx => ...`). |
| `bot.drop(pred, ...mw)` | Inverse of `filter`: runs `mw` if `pred(ctx)` returns `false` (or call `bot.drop(pred)` with no `mw` to silently drop matching updates and stop downstream middleware!). |
| `bot.fork(...mw)` | Runs `mw` **concurrently** alongside downstream middleware (`Promise.all([next(), run(mw)])`). Both branches execute in parallel on the same update. |
| `bot.lazy(factory)` | Calls `factory(ctx)` dynamically per update to generate middleware on the fly (return `[]` to skip). |
| `bot.route(routerFn, branches, fallback)` | Dispatches `ctx` to a named branch in `branches` record based on `routerFn(ctx)`. |
| `bot.errorBoundary(errHandler, ...mw)` | Isolates errors thrown inside `mw` and passes them to `errHandler(botError, next)`. |

---

## 2. Bot API Transformers & API Flavoring (`advanced/transformers.md`)

While middleware (`bot.use`) intercepts **incoming** updates, API Transformer functions (`bot.api.config.use`) intercept **outgoing** Bot API HTTP requests in reverse-onion order.

### Transformer Signature
```ts
type Transformer = (
  prev: ApiCallFn,
  method: string,            // e.g. "sendMessage", "sendPhoto"
  payload: Record<string, unknown>, // e.g. { chat_id: 123, text: "hi" }
  signal?: AbortSignal,      // ALWAYS pass `signal` to `prev(method, payload, signal)`!
) => Promise<ApiResponse>;
```

### Example: Global vs. Context-Scoped Transformers
- **`bot.api.config.use(transformer)`**: Installed globally; runs on every `bot.api.*`, `ctx.api.*`, and `ctx.reply*` call.
- **`ctx.api.config.use(transformer)`**: Installed dynamically inside middleware; applies **only** to API calls made through that specific `ctx` (and is discarded when the update finishes):

```ts
// Example: Disable link previews on all messages sent during this update
bot.use(async (ctx, next) => {
  ctx.api.config.use((prev, method, payload, signal) => {
    if (method === "sendMessage") {
      payload = {
        ...payload,
        link_preview_options: { is_disabled: true },
      };
    }
    return prev(method, payload, signal);
  });
  await next();
});
```

### Critical Stream Pitfall in Transformers
If `payload` contains an `InputFile` backed by a single-use `ReadableStream` or `Iterable`, calling `prev(method, payload, signal)` consumes the stream! If a transformer retries `prev()` after a failure, the stream will already be drained (`locked` / empty). Pass a file path or a factory function `new InputFile(() => fs.createReadStream(path))` if using retry transformers with streams.

### API Flavoring (`Bot<MyContext, MyApi>`)
When a transformer plugin adds methods to `bot.api` or modifies API return types (such as `@grammyjs/hydrate` or `@grammyjs/files`), pass the API flavor as the second generic parameter to `Bot`:

```ts
import { Api, Bot, Context } from "grammy";
import { FileApiFlavor, FileFlavor, hydrateFiles } from "@grammyjs/files";
import { HydrateApiFlavor, HydrateFlavor, hydrateApi, hydrateContext } from "@grammyjs/hydrate";

type MyContext = FileFlavor<HydrateFlavor<Context>>;
type MyApi = FileApiFlavor<HydrateApiFlavor<Api>>;

const bot = new Bot<MyContext, MyApi>(process.env.BOT_TOKEN!);
```

---

## 3. Telegram Business Bots (`advanced/business.md`)

Telegram Premium users can connect your bot to their **Telegram Business** account to automate customer chats on their behalf.

### 1. Enabling Business Mode
Enable **Business Mode** for your bot in `@BotFather` (`/mybots` → Bot Settings → Business Mode).

### 2. Handling Business Connections (`business_connection`)
When a user connects, edits permissions for, or disconnects your bot from their Business account, your bot receives a `business_connection` update:

```ts
bot.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  console.log(
    `Business user ${conn.user.first_name} (${conn.user.id}) connection ${conn.id}: is_enabled=${conn.is_enabled}, can_reply=${conn.rights?.can_reply}`,
  );
  // Note: To message the business owner privately, use conn.user_chat_id!
  if (conn.is_enabled && conn.rights?.can_reply) {
    await bot.api.sendMessage(conn.user_chat_id, "✅ Your Business account is now connected!");
  }
});

// Query connection details on demand:
// const conn = await bot.api.getBusinessConnection(connectionId);
```

### 3. Handling Business Messages (`business_message`, `edited_business_message`, `deleted_business_messages`)
- **Built-in Shortcut Support**: grammY's `"msg"` and `":text"` filter queries automatically include `business_message`! Similarly, `"edit"` includes `edited_business_message`, and `ctx.businessConnectionId` is automatically populated.
- **Automatic `business_connection_id` Routing**: When you call `await ctx.reply("Hello!")` inside a `business_message` handler, grammY **automatically** passes `business_connection_id: ctx.businessConnectionId` so the message is sent through the Business owner's chat!
- **Distinguishing Customer vs. Business Owner Messages**:
  In a Business chat between Business Owner `U` and Customer `C`, your bot receives `business_message` updates from **both** `U` and `C`! Compare `ctx.from.id` against the connection owner's user ID to avoid infinite echo loops:

```ts
bot.on("business_message:text", async (ctx) => {
  const conn = await ctx.getBusinessConnection();
  const employee = conn.user;

  if (ctx.from.id === employee.id) {
    // Sent by the Business owner themselves — ignore or handle internal commands!
    return;
  }

  // Sent by the customer:
  if (conn.rights?.can_reply) {
    await ctx.reply(`Thanks for your message! ${employee.first_name} will reply shortly.`);
  }
});

// Listen for deleted messages in a Business chat:
bot.on("deleted_business_messages", async (ctx) => {
  const { business_connection_id, chat, message_ids } = ctx.deletedBusinessMessages;
  console.log(`Deleted messages ${message_ids.join(", ")} in chat ${chat.id}`);
});
```

### 4. Business Chat Links (`bizChat` Deep Links)
Businesses can create pre-filled chat links (`https://t.me/...`). When clicked by a user who starts your bot, Telegram passes `/start bizChat<id>`.

---

## 4. Proxy Support Across Runtimes (`advanced/proxy.md`)

If your server requires an HTTP/HTTPS or SOCKS5 proxy to reach `api.telegram.org`:

### Node.js (`socks-proxy-agent` or `https-proxy-agent`)
> **Performance Tip**: Always set `compress: true` in `baseFetchConfig` when passing a custom `agent` in Node.js to keep HTTP gzip compression active!

```ts
import { Bot } from "grammy";
import { SocksProxyAgent } from "socks-proxy-agent";
// Or: import { HttpsProxyAgent } from "https-proxy-agent";

const socksAgent = new SocksProxyAgent("socks5://127.0.0.1:1080");

const bot = new Bot(process.env.BOT_TOKEN!, {
  client: {
    baseFetchConfig: {
      agent: socksAgent,
      compress: true,
    },
  },
});
```

### Deno (`Deno.createHttpClient`)
Requires `--allow-net` flag:
```ts
import { Bot } from "npm:grammy";

const client = Deno.createHttpClient({
  proxy: { url: "http://127.0.0.1:8080" },
});

const bot = new Bot(Deno.env.get("BOT_TOKEN")!, {
  client: { client },
});
```

### Bun
Pass `proxy` in `baseFetchConfig`:
```ts
const bot = new Bot(process.env.BOT_TOKEN!, {
  client: {
    baseFetchConfig: {
      proxy: "http://127.0.0.1:8080",
    },
  },
});
```

---

## 5. Framework & Language Comparisons (`resources/comparison.md`)

- **grammY vs. Telegraf v4**:
  - grammY was built from the ground up in pure TypeScript so types flow naturally without fighting complex internal union gymnastics.
  - grammY tracks the latest Telegram Bot API releases immediately, embeds official Bot API docstrings directly in IDE hover tooltips, introduces **API Transformers** (`bot.api.config.use`), runs natively across Node.js, Deno, Bun, and Cloudflare Workers, and has a rich, unified official documentation and plugin ecosystem (`conversations`, `menu`, `runner`, `commands`, `parse-mode`).
  - Syntax difference note: Telegraf v4 uses `bot.on(message("text"))`; grammY uses string filter queries `bot.on("message:text")` or `bot.on(":text")`.
- **grammY vs. `node-telegram-bot-api` (NTBA)**:
  - NTBA uses a flat `EventEmitter` without middleware composition, context objects, or TypeScript safety, leading to unmaintainable spaghetti in bots larger than ~50 lines.

---

## 6. Troubleshooting & Official FAQ (`resources/faq.md`)

### Q1: "A method is missing an optional parameter!"
grammY places required parameters as positional arguments and groups **all optional parameters** into the final `other` options object (`{ parse_mode, reply_markup, reply_parameters, message_thread_id, ... }`).

### Q2: "How can I access the chat history?"
**You can't fetch past history from Telegram.** Telegram does not expose an API for bots to read old messages sent before or while the bot was listening. Your bot must store incoming `message` / `channel_post` updates in your own database as they arrive.

### Q3: "How can I handle incoming media albums (`media_group_id`)?"
In Telegram, an album only exists as a visual grouping in the client UI. To a bot, an album is delivered as **individual `message` updates** that happen to share the same `ctx.msg.media_group_id`.
- You **cannot** know in advance how many messages belong to an album or whether the last message has arrived.
- **Recommended UX**: Handle each file update individually, or store incoming files in session/DB and provide an inline button ("✅ Done uploading") or `/done` command for the user to trigger batch processing.

### Q4: Common Telegram Error Codes & Fixes

| Error Code & Message | Root Cause & Exact Fix |
| :--- | :--- |
| **`400 Bad Request: Cannot parse entities`** | Malformed HTML or unescaped MarkdownV2 characters in `parse_mode`. **Fix**: Use [`@grammyjs/parse-mode`](./plugins-guide.md#9-parse-mode--formattedstring-grammyjsparse-mode) (`fmt` / `FormattedString`) to pass pre-computed `entities` instead of `parse_mode`! |
| **`401 Unauthorized`** / **`404 Not Found`** | Your `BOT_TOKEN` is invalid, has a typo/whitespace, or was revoked. Verify with `@BotFather`. |
| **`403 Forbidden: bot was blocked by the user`** | The user blocked your bot in private chat. Catch `GrammyError` with `e.error_code === 403` and mark the user inactive, or listen to `bot.on("my_chat_member")` where `new_chat_member.status === "kicked"`. |
| **`409 Conflict: terminated by other getUpdates request`** | More than one long-polling instance (`bot.start()` or `run(bot)`) is running with the same token simultaneously. Stop the duplicate process (or revoke the token via `@BotFather` if running on an unknown machine). |
| **`429 Too Many Requests: retry after X`** | Hit Telegram's rate limits (flood wait). **Fix**: Install `bot.api.config.use(autoRetry())` (`@grammyjs/auto-retry`), avoid `Promise.all` bursts, and throttle broadcasts to <30 msgs/sec. |
| **`Cannot find type definition file for 'node-fetch'`** | Missing transitive `@types/node-fetch` when `skipLibCheck: false`. **Fix**: Set `"skipLibCheck": true` in `tsconfig.json` (recommended) or run `npm i -D @types/node-fetch@2`. |
