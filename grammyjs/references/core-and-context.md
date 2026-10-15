# grammY Core Architecture & Context Deep Dive

This reference guide covers the core engine of **grammY**: bot initialization, the Context (`ctx`) lifecycle, Context Flavoring, the onion middleware pipeline, filter queries, command/reaction routing, error boundaries, file streams, and outgoing API transformers.

---

## 1. Bot Initialization & Configuration

### Standard Initialization
```typescript
import { Bot } from "grammy";

export const bot = new Bot(process.env.BOT_TOKEN!, {
  // Client options for outgoing Telegram Bot API requests
  client: {
    // Custom API root (e.g., local Bot API server)
    apiRoot: process.env.BOT_API_ROOT || "https://api.telegram.org",
    // Custom fetch implementation or proxy agent
    timeoutSeconds: 30,
  },
  // Bot information can be pre-supplied to avoid calling `getMe` at startup
  botInfo: undefined,
});
```

### Starting the Bot
- **Development / Simple polling**: `bot.start()`
- **High-traffic concurrent polling**: Use `@grammyjs/runner` with `run(bot)` (see `references/deployment-and-scaling.md`)
- **Webhooks**: Use `webhookCallback(bot, adapter)` (see `references/deployment-and-scaling.md`)

---

## 2. Context (`ctx`) & Context Flavoring

### Understanding `ctx`
Every Telegram update received produces a `Context` object. `ctx` contains:
- `ctx.update`: The raw Telegram Update object.
- `ctx.api`: Instance of the Bot API pre-configured for this bot.
- `ctx.me`: Bot's own user info (`UserFromGetMe`).
- `ctx.chat`: Shortcut for `ctx.msg?.chat` or update chat.
- `ctx.from`: Shortcut for the user who triggered the update.
- `ctx.msg`: Shortcut for the message object (handles `message`, `edited_message`, `channel_post`, `business_message`, etc.).
- `ctx.match`: Extracted data from regex (`bot.hears`), command arguments (`bot.command`), or callback queries.

### Context Flavoring Patterns in TypeScript
In TypeScript, grammY allows you to strongly type plugins and extensions added to `ctx`.

There are two kinds of context flavors:
1. **Additive Flavors (`Context & Flavor`)**: Combines fields onto the context (e.g., `SessionFlavor`, `ConversationFlavor`, custom user properties).
2. **Transformative / Synergistic Flavors (`Flavor<Context>`)**: Wraps and modifies existing context methods (e.g., `HydrateFlavor`, `AutoChatFlavor`).

#### Best-Practice Custom Context Definition
```typescript
import { Context, SessionFlavor } from "grammy";
import { type ConversationFlavor } from "@grammyjs/conversations";
import { type HydrateFlavor } from "@grammyjs/hydrate";
import { type I18nFlavor } from "@grammyjs/i18n";

// 1. Define your Session Schema
export interface SessionData {
  step: "idle" | "awaiting_input" | "checkout";
  cart: Array<{ id: string; qty: number }>;
  preferences: {
    theme: "light" | "dark";
    locale: string;
  };
}

// 2. Define Custom Context Properties
export interface CustomFlavor {
  userDbId?: number;
  isAdmin: boolean;
}

// 3. Compose all flavors into MyContext
// Use transformative flavors on the outside, additive inside:
export type MyContext = HydrateFlavor<
  Context & SessionFlavor<SessionData> & ConversationFlavor & I18nFlavor & CustomFlavor
>;

// 4. Pass MyContext as generic to Bot and Composers
export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
```

---

## 3. The Middleware Pipeline (Onion Model)

grammY executes middleware in an onion layer architecture (identical to Koa).
- Downstream execution flows until a handler stops calling `await next()`.
- Upstream execution rewinds back after child middleware resolves.

```typescript
// Logging & Latency Middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  // Downstream execution
  await next();
  // Upstream execution
  const ms = Date.now() - start;
  console.log(`Update ${ctx.update.update_id} took ${ms}ms`);
});

// Guard Middleware (Early return halts execution)
bot.use(async (ctx, next) => {
  if (ctx.from?.is_bot) {
    return; // Stop processing bot updates
  }
  await next();
});
```

### Middleware Rules & Gotchas
- **Always `await next()`**: If you omit `await`, upstream execution will fire before downstream work completes, causing race conditions in session saving and error tracking.
- **Do not call `next()` multiple times**: Doing so throws an error.
- **Short-circuiting**: If a handler answers an update (e.g., handles `/start`), omit `next()` unless downstream middleware is intended to also execute.

---

## 4. Filter Queries & `bot.on()`

Filter queries provide compile-time type narrowing of the `ctx` object.

```typescript
// Narrowed to Message update with text
bot.on("message:text", async (ctx) => {
  // ctx.msg.text is guaranteed string
  const text: string = ctx.msg.text;
  await ctx.reply(`Echo: ${text}`);
});

// Multiple filter queries (OR logic)
bot.on(["message:photo", "message:video"], async (ctx) => {
  // ctx.msg.photo or ctx.msg.video exists
  await ctx.reply("Received visual media!");
});

// Deep filter queries
bot.on("message:entities:url", async (ctx) => {
  await ctx.reply("You sent a message containing a URL!");
});

// Callback queries (inline buttons)
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery({ text: `Pressed: ${data}` });
});

// Chat member updates
bot.on("chat_member", async (ctx) => {
  const { old_chat_member, new_chat_member } = ctx.chatMember;
  console.log(`User status changed: ${old_chat_member.status} -> ${new_chat_member.status}`);
});
```

---

## 5. Commands, Hears, and Reactions

### Commands (`bot.command`)
```typescript
// Handles /start or /start <payload> (deep linking)
bot.command("start", async (ctx) => {
  const payload = ctx.match; // Text after "/start "
  if (payload) {
    await ctx.reply(`Welcome via referral: ${payload}`);
  } else {
    await ctx.reply("Welcome!");
  }
});

// Multiple command aliases
bot.command(["help", "guide"], async (ctx) => {
  await ctx.reply("Here is how to use this bot...");
});
```

### Regex & Pattern Matching (`bot.hears`)
```typescript
bot.hears(/^item_(\d+)$/, async (ctx) => {
  // ctx.match[1] contains the captured digits
  const itemId = ctx.match[1];
  await ctx.reply(`Details for item #${itemId}`);
});
```

### Reactions (`bot.reaction`) - Bot API 7.0+
Listen to reactions added by users:
```typescript
bot.reaction(["👍", "🎉"], async (ctx) => {
  await ctx.reply("Thanks for the positive reaction!");
});

// Reacting to a message from the bot:
bot.on("message:text", async (ctx) => {
  // Shortcut to set reaction on the incoming message
  await ctx.react("⚡");
});
```

---

## 6. Error Handling & Error Boundaries

### Global Error Handler (`bot.catch`)
Every production bot must have a global `bot.catch`. Unhandled errors crash polling or lead to webhook timeouts.

```typescript
import { BotError, GrammyError, HttpError } from "grammy";

bot.catch((err: BotError<MyContext>) => {
  const ctx = err.ctx;
  console.error(`[Error] Update ${ctx.update.update_id} failed:`);
  
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Telegram API Error:", e.description, `(Code: ${e.error_code})`);
  } else if (e instanceof HttpError) {
    console.error("Network / HTTP Connection Error:", e);
  } else {
    console.error("Unexpected Application Error:", e);
  }
});
```

### Error Boundaries
Isolate failures to specific subsystems (e.g. payment handling or external API calls) so the rest of the bot continues functioning.

```typescript
import { Composer } from "grammy";

const paymentModule = new Composer<MyContext>();

const boundedPayment = paymentModule.errorBoundary(async (err, next) => {
  console.error("Payment pipeline error:", err.error);
  await err.ctx.reply("⚠️ An issue occurred processing your payment. Our team has been alerted.");
  // Optionally call `await next()` to continue bubbling
});

boundedPayment.on("pre_checkout_query", async (ctx) => {
  // If this throws, boundedPayment catch handler runs
});

bot.use(paymentModule);
```

---

## 7. File Handling & Streams

### Sending Files using `InputFile`
grammY provides `InputFile` for uploading files from local disk, URLs, Node/Bun Buffers, or Web Streams.

```typescript
import { InputFile } from "grammy";
import { createReadStream } from "node:fs";

// 1. From local file path
await ctx.replyWithPhoto(new InputFile("./assets/hero.png"));

// 2. From URL (Telegram downloads it directly)
await ctx.replyWithPhoto("https://example.com/banner.jpg");

// 3. From a Buffer or Uint8Array
const buffer = Buffer.from("Hello world, this is a file content");
await ctx.replyWithDocument(new InputFile(buffer, "notes.txt"));

// 4. From Node.js / Bun stream
const stream = createReadStream("./large-video.mp4");
await ctx.replyWithVideo(new InputFile(stream, "video.mp4"));
```

### Downloading Files
```typescript
bot.on("message:document", async (ctx) => {
  const file = await ctx.getFile();
  // file.file_path is relative to `https://api.telegram.org/file/bot<token>/`
  console.log("File path:", file.file_path);
  
  // Direct download URL:
  const downloadUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  
  // Or using @grammyjs/files plugin (see references/plugins-guide.md)
});
```

---

## 8. Outgoing API Transformers

Transformers intercept every outgoing Bot API request before it reaches Telegram.
Install them via `bot.api.config.use(...)`.

```typescript
// Custom transformer: Automatically append watermark or log API calls
bot.api.config.use(async (prev, method, payload, signal) => {
  console.log(`[API CALL] Method: ${method}, Payload:`, payload);
  
  // Execute the actual request
  const result = await prev(method, payload, signal);
  return result;
});
```
Official plugins built as transformers:
- `@grammyjs/auto-retry` (retries 429 flood waits)
- `@grammyjs/transformer-throttler` (smooths outbound burst rates)
- `@grammyjs/parse-mode` (sets default HTML/Markdown parse mode)
