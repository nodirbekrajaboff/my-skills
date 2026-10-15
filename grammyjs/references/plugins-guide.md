# grammY Plugins Guide & Best Practices

grammY has a rich ecosystem of built-in and official modular plugins. This guide explains how and when to use each plugin, along with code patterns, type flavoring, and critical anti-patterns.

---

## 1. Built-in Plugins

### 1.1 Keyboards (`InlineKeyboard` & `Keyboard`)
Imported directly from `"grammy"`.

#### Inline Keyboard (Attached to messages)
```typescript
import { InlineKeyboard } from "grammy";

const inlineKeyboard = new InlineKeyboard()
  .text("Option A", "btn:opt_a")
  .text("Option B", "btn:opt_b")
  .row()
  .url("Docs", "https://grammy.dev")
  .webApp("Open App", "https://my-mini-app.com")
  .row()
  .switchInline("Share with friends", "Check this out!");

await ctx.reply("Please make a choice:", {
  reply_markup: inlineKeyboard,
});
```

#### Custom Reply Keyboard (Replaces device keyboard)
```typescript
import { Keyboard } from "grammy";

const customKeyboard = new Keyboard()
  .text("📍 Send Location").requestLocation()
  .text("📞 Send Contact").requestContact()
  .row()
  .text("Cancel")
  .resized() // Shrinks keyboard height to match buttons
  .oneTime(); // Hides keyboard after a single tap

await ctx.reply("Share your credentials:", {
  reply_markup: customKeyboard,
});
```

---

### 1.2 Sessions (`session` & `lazySession`)
Provides persistent state across updates for a given chat or user.

#### In-Memory Session (Development only)
```typescript
import { Bot, Context, session, type SessionFlavor } from "grammy";

interface SessionData {
  pizzaCount: number;
}
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(
  session({
    initial: (): SessionData => ({ pizzaCount: 0 }),
    // Default session key is `${ctx.chat?.id}`
  })
);

bot.command("pizza", async (ctx) => {
  ctx.session.pizzaCount++;
  await ctx.reply(`You have ordered ${ctx.session.pizzaCount} pizzas!`);
});
```

#### Persistent Storage Adapters (Production)
For production, never use default in-memory storage (data is lost on reboot, and clustering fails).
Install the appropriate adapter:
- Redis: `@grammyjs/storage-redis`
- MongoDB: `@grammyjs/storage-mongodb`
- Supabase: `@grammyjs/storage-supabase`
- Prisma: `@grammyjs/storage-prisma`
- Deno KV: `@grammyjs/storage-denokv`
- File: `@grammyjs/storage-file`

Example with Redis:
```typescript
import { RedisAdapter } from "@grammyjs/storage-redis";
import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL!);
const storage = new RedisAdapter({ instance: redis, ttl: 86400 });

bot.use(
  session({
    initial: () => ({ pizzaCount: 0 }),
    storage,
  })
);
```

#### Lazy Sessions (`lazySession`)
When using remote databases, reading and writing session data on every single update adds latency.
`lazySession` resolves the session Promise only when `await ctx.session` is accessed.

---

## 2. Interactive Dialogs & State

### 2.1 Conversations (`@grammyjs/conversations`)
Allows writing multi-step dialogs linearly using `async`/`await` instead of complex state machine transitions.

```bash
bun add @grammyjs/conversations
# or npm install @grammyjs/conversations
```

#### Setup & Types
```typescript
import { Context, session, type SessionFlavor } from "grammy";
import {
  conversations,
  createConversation,
  type ConversationFlavor,
  type Conversation,
} from "@grammyjs/conversations";

type MyContext = Context & SessionFlavor<{}> & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

// Define conversation builder function
async function checkoutConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("What is your delivery address?");
  
  // Wait for text message response
  const addressCtx = await conversation.waitFor("message:text");
  const address = addressCtx.msg.text;

  await ctx.reply(`Deliver to: ${address}.\nHow many units would you like?`);
  
  // Wait until user sends a valid number
  const unitsCtx = await conversation.waitFor("message:text");
  const count = parseInt(unitsCtx.msg.text, 10);
  
  if (isNaN(count) || count <= 0) {
    await ctx.reply("Invalid quantity. Cancelling checkout.");
    return;
  }

  // CRITICAL: Side-effects (database queries, network calls) MUST use conversation.external!
  const orderId = await conversation.external(async () => {
    return await db.orders.create({ address, count, userId: ctx.from!.id });
  });

  await ctx.reply(`✅ Order created! ID: #${orderId}`);
}

// Order of installation is mandatory:
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
bot.use(createConversation(checkoutConversation));

// Entering the conversation
bot.command("buy", async (ctx) => {
  await ctx.conversation.enter("checkoutConversation");
});
```

#### Critical Conversations Rules:
1. **Always register `session()` before `conversations()`**.
2. **Never execute non-deterministic actions directly**: Wrap random number generators, current timestamps, external database calls, or HTTP requests inside `await conversation.external(() => ...)` so the replay engine stays consistent.
3. **Do not modify global variables** directly inside a conversation function without `conversation.external`.

---

### 2.2 Interactive Menus (`@grammyjs/menu`)
Declarative, dynamic, hierarchical inline keyboards that update smoothly without flickering or resending messages.

```bash
bun add @grammyjs/menu
# or npm install @grammyjs/menu
```

```typescript
import { Menu, MenuRange } from "@grammyjs/menu";

// Root Menu
const mainMenu = new Menu<MyContext>("main-menu")
  .text(
    (ctx) => (ctx.session.notifications ? "🔔 Notifications [ON]" : "🔕 Notifications [OFF]"),
    (ctx) => {
      ctx.session.notifications = !ctx.session.notifications;
      ctx.menu.update(); // Re-renders the button label in place!
    }
  )
  .row()
  .submenu("Settings", "settings-menu")
  .row()
  .text("Help", (ctx) => ctx.reply("Need assistance? Contact support."));

// Submenu
const settingsMenu = new Menu<MyContext>("settings-menu")
  .text("Profile", (ctx) => ctx.reply("User Profile..."))
  .text("Language", (ctx) => ctx.reply("Language options..."))
  .row()
  .back("⬅️ Back"); // Automatically navigates back to parent

// Register hierarchy
mainMenu.register(settingsMenu);
bot.use(mainMenu);

bot.command("settings", async (ctx) => {
  await ctx.reply("Control Panel:", { reply_markup: mainMenu });
});
```

#### Dynamic Paginated Lists in Menus
```typescript
const fruitMenu = new Menu<MyContext>("fruits-menu")
  .dynamic(async (ctx, range) => {
    const fruits = ["Apple", "Banana", "Cherry", "Date", "Elderberry"];
    for (const fruit of fruits) {
      range
        .text(fruit, (c) => c.reply(`You chose ${fruit}`))
        .row();
    }
  })
  .back("Back");
```

---

## 3. High Load, Concurrency & Resilience

### 3.1 Concurrency Runner & Sequentialize (`@grammyjs/runner`)
grammY runner processes updates concurrently with customizable workers.

```bash
bun add @grammyjs/runner
# or npm install @grammyjs/runner
```

```typescript
import { Bot, Context, session } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);

// Deterministic session key generator
function getSessionKey(ctx: Context): string | undefined {
  return ctx.chat?.id.toString();
}

// 1. MUST sequentialize updates by session key BEFORE session middleware
// Prevents Write-After-Read (WAR) race condition hazards
bot.use(sequentialize(getSessionKey));

// 2. Install session
bot.use(session({ getSessionKey, initial: () => ({}) }));

// 3. Start runner instead of bot.start()
const runner = run(bot, {
  runner: {
    fetch: {
      allowed_updates: ["message", "callback_query"],
    },
  },
  sink: {
    concurrency: 500, // Maximum concurrent updates
  },
});

// Graceful termination
const stop = () => runner.isRunning() && runner.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
```

---

### 3.2 Auto-Retry (`@grammyjs/auto-retry`)
Automatically intercepts HTTP 429 (`Too Many Requests`) flood wait responses, delays execution for `retry_after` seconds, and retries the request safely.

```bash
bun add @grammyjs/auto-retry
```

```typescript
import { autoRetry } from "@grammyjs/auto-retry";

bot.api.config.use(
  autoRetry({
    maxRetryAttempts: 3, // Max retries per request
    maxDelaySeconds: 60, // Maximum wait time before giving up
  })
);
```

---

### 3.3 Transformer Throttler (`@grammyjs/transformer-throttler`)
Throttles outbound API calls to keep them smoothly under Telegram limits (30 requests/sec globally, 1 message/sec per private chat).

```bash
bun add @grammyjs/transformer-throttler
```

```typescript
import { apiThrottler } from "@grammyjs/transformer-throttler";

const throttler = apiThrottler({
  global: {
    maxAmount: 30,
    timespan: 1000,
  },
  out: {
    maxAmount: 1,
    timespan: 1000,
  },
});

bot.api.config.use(throttler);
```

---

### 3.4 Rate Limiter (`@grammyjs/ratelimiter`)
Protects against inbound spam floods by dropping or punishing users who send updates too quickly.

```bash
bun add @grammyjs/ratelimiter
```

```typescript
import { limit } from "@grammyjs/ratelimiter";

bot.use(
  limit({
    timeFrame: 2000, // 2 seconds
    limit: 3,        // 3 requests allowed per timeFrame
    onLimitExceeded: async (ctx) => {
      await ctx.reply("⚠️ Please slow down! You are sending commands too quickly.");
    },
    keyGenerator: (ctx) => ctx.from?.id.toString(),
  })
);
```

---

## 4. Developer Ergonomics & Utilities

### 4.1 Hydrate (`@grammyjs/hydrate`)
Allows direct method calling on returned message instances.

```typescript
import { hydrate, type HydrateFlavor } from "@grammyjs/hydrate";

type MyContext = HydrateFlavor<Context>;
bot.use(hydrate());

bot.command("counter", async (ctx) => {
  // Returned message has .editReplyMarkup(), .delete(), .editMessageText()
  const msg = await ctx.reply("Processing...");
  await msg.editText("Done!");
});
```

---

### 4.2 Parse Mode (`@grammyjs/parse-mode`)
Sets a global default parse mode (HTML or MarkdownV2) and exposes tagged template literals for safe escaping.

```typescript
import { parseMode, html, md } from "@grammyjs/parse-mode";

// Default parse mode to HTML for all outgoing requests
bot.api.config.use(parseMode("HTML"));

bot.command("info", async (ctx) => {
  const userInput = "<script>alert('xss')</script>";
  // Automatically escapes dynamic interpolation safely:
  await ctx.reply(html`<b>User:</b> ${userInput}`);
});
```

---

### 4.3 Files (`@grammyjs/files`)
Installs `download()` helper on file objects.

```typescript
import { hydrateFiles } from "@grammyjs/files";

bot.api.config.use(hydrateFiles(bot.token));

bot.on("message:photo", async (ctx) => {
  const file = await ctx.getFile();
  // Download directly to disk:
  const path = await file.download("./downloads/photo.jpg");
  console.log("Saved photo to:", path);
});
```

---

### 4.4 Internationalization (`@grammyjs/i18n`)
Multi-language translation using Fluent files (`.ftl`).

```typescript
import { I18n, type I18nFlavor } from "@grammyjs/i18n";

const i18n = new I18n<MyContext>({
  defaultLocale: "en",
  directory: "locales",
});

bot.use(i18n);

bot.command("start", async (ctx) => {
  // Uses key from locales/en.ftl or locales/es.ftl based on ctx.from.language_code
  await ctx.reply(ctx.t("welcome", { name: ctx.from?.first_name }));
});
```

---

### 4.5 Autoquote (`@grammyjs/autoquote`)
Ensures all bot replies automatically quote the triggering message as a reply without passing `reply_parameters`.

```typescript
import { autoQuote } from "@grammyjs/autoquote";

bot.use(autoQuote);
```

---

### 4.6 Streaming Message Drafts (`@grammyjs/stream`)
Streams text incrementally into private chats (perfect for LLMs, OpenAI, Claude, Gemini).
It installs `ctx.replyWithStream`, `ctx.replyWithMarkdownStream`, and `ctx.replyWithHtmlStream`.

```bash
bun add @grammyjs/stream @grammyjs/auto-retry
```

```typescript
import { Bot, type Context } from "grammy";
import { stream, type StreamFlavor } from "@grammyjs/stream";
import { autoRetry } from "@grammyjs/auto-retry";

type MyContext = StreamFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// MUST use autoRetry because streaming performs rapid API calls
bot.api.config.use(autoRetry());
bot.use(stream());

// Generator yielding token chunks
async function* generateResponse(prompt: string) {
  const chunks = ["Thinking...", "\nHere is", " your answer", " generated progressively!"];
  for (const chunk of chunks) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 400));
  }
}

bot.chatType("private").command("ask", async (ctx) => {
  // Streams Markdown text live
  await ctx.replyWithMarkdownStream(generateResponse(ctx.match));
});
```

---

### 4.7 Stateless Question (`@grammyjs/stateless-question`)
Allows asking a question and catching the user's reply without persisting any session data in a database. It works by appending a zero-width invisible character sequence to the question message.

```bash
bun add @grammyjs/stateless-question
```

```typescript
import { StatelessQuestion } from "@grammyjs/stateless-question";

const ageQuestion = new StatelessQuestion("ask_age", async (ctx) => {
  const age = Number(ctx.message.text);
  await ctx.reply(`You are ${age} years old!`);
});

bot.use(ageQuestion.middleware());

bot.command("start", async (ctx) => {
  await ageQuestion.replyWithMarkdown(ctx, "How old are you?");
});
```

---

### 4.8 Media Groups (`@grammyjs/media-group`)
When users send multiple photos or videos as an album, Telegram delivers them as separate messages sharing the same `media_group_id`. This plugin groups them into a single update.

```bash
bun add @grammyjs/media-group
```

```typescript
import { mediaGroup } from "@grammyjs/media-group";

bot.use(mediaGroup());

bot.on("message:media_group", async (ctx) => {
  // ctx.mediaGroup is an array of messages belonging to this album
  console.log(`Received album containing ${ctx.mediaGroup.length} items`);
});
```

---

### 4.9 Router (`@grammyjs/router`)
Implements deterministic routing for finite state machines based on a key (e.g., current route stored in session).

```bash
bun add @grammyjs/router
```

```typescript
import { Router } from "@grammyjs/router";

const router = new Router<MyContext>((ctx) => ctx.session.step);

router.route("step_one", async (ctx) => {
  await ctx.reply("In step 1. Moving to step 2...");
  ctx.session.step = "step_two";
});

router.route("step_two", async (ctx) => {
  await ctx.reply("In step 2. Finished!");
  ctx.session.step = "idle";
});

bot.use(router);
```

---

### 4.10 Chat Members (`@grammyjs/chat-members`)
Maintains an in-memory or Redis-backed cache of chat member statuses and permissions to avoid repeated `getChatMember` Bot API calls.

```bash
bun add @grammyjs/chat-members
```

```typescript
import { chatMembers, MemoryStorageAdapter } from "@grammyjs/chat-members";

const adapter = new MemoryStorageAdapter();
bot.use(chatMembers(adapter));

bot.command("check_admin", async (ctx) => {
  const status = await ctx.chatMembers.getChatMember();
  await ctx.reply(`Your status is: ${status.status}`);
});
```

---

### 4.11 Commands (`@grammyjs/commands`)
Allows defining bot commands centrally and syncing them automatically with Telegram's command menu via `setMyCommands`.

```bash
bun add @grammyjs/commands
```

```typescript
import { commands, type CommandsFlavor } from "@grammyjs/commands";

type MyContext = CommandsFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

const myCommands = commands();
myCommands.set({
  command: "start",
  description: "Start the bot",
});
myCommands.set({
  command: "help",
  description: "Show help information",
});

bot.use(myCommands);
// Automatically registers command list with BotFather
await bot.api.setMyCommands(myCommands.toObject());
```

---

### 4.12 Entity Parser (`@grammyjs/entity-parser`)
Provides utilities to inspect, extract, and manipulate message entities (bold, code, links, mentions) without manual byte offset calculations.

```bash
bun add @grammyjs/entity-parser
```

```typescript
import { parseEntities } from "@grammyjs/entity-parser";

bot.on("message:text", (ctx) => {
  const parsed = parseEntities(ctx.msg);
  for (const part of parsed) {
    if (part.type === "url") {
      console.log("Found URL:", part.text);
    }
  }
});
```

---

### 4.13 Useful Middlewares (`@grammyjs/middlewares`)
Collection of utility middlewares: `ignoreOld` (drops updates received while bot was offline), `ipFilter` (restricts webhooks), etc.

```bash
bun add @grammyjs/middlewares
```

```typescript
import { ignoreOld } from "@grammyjs/middlewares";

// Drop updates older than 5 minutes
bot.use(ignoreOld(300));
```

---

## 5. How to Create Your Own Plugins

grammY plugins come in two varieties:

### 5.1 Middleware Plugins (Input Interception)
A middleware plugin extends `ctx` or intercepts the update flow.

```typescript
import { type Middleware, type Context } from "grammy";

export interface MyPluginOptions {
  greeting?: string;
}

export function myPlugin<C extends Context>(options: MyPluginOptions = {}): Middleware<C> {
  const greeting = options.greeting || "Hello!";
  
  return async (ctx, next) => {
    // Modify ctx or perform pre-processing
    console.log(`[MyPlugin] Processing update for user ${ctx.from?.id}`);
    
    // Call next middleware
    await next();
    
    // Post-processing
  };
}

// Usage:
// bot.use(myPlugin({ greeting: "Welcome!" }));
```

### 5.2 Transformer Plugins (Output Interception)
A transformer plugin modifies or intercepts outgoing Bot API requests (like `@grammyjs/auto-retry` or `@grammyjs/parse-mode`).

```typescript
import { type Transformer } from "grammy";

export function autoCapitalize(): Transformer {
  return async (prev, method, payload, signal) => {
    if (method === "sendMessage" && typeof payload.text === "string") {
      payload.text = payload.text.toUpperCase();
    }
    return await prev(method, payload, signal);
  };
}

// Usage:
// bot.api.config.use(autoCapitalize());
```

---

## 6. Plugin Summary Matrix

| Plugin | Type | Primary Purpose | Best Used When |
| :--- | :--- | :--- | :--- |
| `session` | Middleware | State storage per chat/user | User preferences, shopping carts, step tracking |
| `@grammyjs/conversations` | Middleware | Multi-step linear branching dialogs | Forms, onboarding wizards, questionnaires |
| `@grammyjs/menu` | Middleware | Interactive inline keyboards | Settings, navigations, pagination, toggles |
| `@grammyjs/runner` | Orchestrator | High-throughput concurrent polling | 100+ updates/minute in polling mode |
| `@grammyjs/auto-retry` | Transformer | Automatic 429 backoff handling | Every production bot making API calls |
| `@grammyjs/transformer-throttler` | Transformer | Outbound traffic smoothing | Broadcasts, heavy group bot operations |
| `@grammyjs/ratelimiter` | Middleware | Inbound spam control | Public groups and high-traffic bots |
| `@grammyjs/hydrate` | Synergistic | Chaining methods on messages | Interactive and mutating messages |
| `@grammyjs/parse-mode` | Transformer | Default HTML/Markdown formatting | Consistent formatting across all messages |
| `@grammyjs/stream` | Synergistic | Streaming text drafts incrementally | LLM tokens, AI text completions |
| `@grammyjs/stateless-question`| Middleware | Asking questions without DB storage | Single-question prompt replies without sessions |
| `@grammyjs/media-group` | Middleware | Aggregating album uploads into one | Photo/video batch upload handlers |
| `@grammyjs/router` | Middleware | Deterministic finite state routing | Complex wizard state machine branches |
| `@grammyjs/chat-members` | Middleware | Caching member status & permissions | Group administration bots |
| `@grammyjs/commands` | Middleware | Dynamic command menu registration | Syncing commands with BotFather menu |
| `@grammyjs/entity-parser` | Utility | Inspecting and slicing entities | Custom message formatters & link extractors |
| `@grammyjs/middlewares` | Utility | ignoreOld, IP filters | Dropping stale updates after downtime |

