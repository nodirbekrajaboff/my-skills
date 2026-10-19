# Complete grammY Plugins Guide (Built-in, Official & Third-Party)

## Table of Contents

### Part I: Built-in Plugins (Core `"grammy"`)
1. [Sessions (`session`, `lazySession`, `enhanceStorage`)](#1-sessions-session-lazysession-enhancestorage)
2. [Inline & Custom Keyboards (`InlineKeyboard` & `Keyboard`)](#2-inline--custom-keyboards-inlinekeyboard--keyboard)
3. [Media Groups (`InputMediaBuilder`)](#3-media-groups-inputmediabuilder)
4. [Inline Queries (`InlineQueryResultBuilder`)](#4-inline-queries-inlinequeryresultbuilder)

### Part II: Official Plugins (`@grammyjs/*`)
5. [Conversations 2.0 (`@grammyjs/conversations`)](#5-conversations-20-grammyjsconversations)
6. [Interactive Menus (`@grammyjs/menu`)](#6-interactive-menus-grammyjsmenu)
7. [Concurrent Runner (`@grammyjs/runner`)](#7-concurrent-runner-grammyjsrunner)
8. [Commands (`@grammyjs/commands`)](#8-commands-grammyjscommands)
9. [Parse Mode & FormattedString (`@grammyjs/parse-mode`)](#9-parse-mode--formattedstring-grammyjsparse-mode)
10. [Message Streaming (`@grammyjs/stream`)](#10-message-streaming-grammyjsstream)
11. [Internationalization (`@grammyjs/i18n` & `@grammyjs/fluent`)](#11-internationalization-grammyjsi18n--grammyjsfluent)
12. [Chat Members (`@grammyjs/chat-members`)](#12-chat-members-grammyjschat-members)
13. [Hydration (`@grammyjs/hydrate`)](#13-hydration-grammyjshydrate)
14. [Files (`@grammyjs/files`)](#14-files-grammyjsfiles)
15. [Auto-Retry (`@grammyjs/auto-retry`)](#15-auto-retry-grammyjsauto-retry)
16. [Flood Control (`@grammyjs/transformer-throttler`)](#16-flood-control-grammyjstransformer-throttler)
17. [User Rate Limiter (`@grammyjs/ratelimiter`)](#17-user-rate-limiter-grammyjsratelimiter)
18. [Emoji (`@grammyjs/emoji`)](#18-emoji-grammyjsemoji)
19. [Router (`@grammyjs/router`)](#19-router-grammyjsrouter)
20. [Stateless Question (`@grammyjs/stateless-question`)](#20-stateless-question-grammyjsstateless-question)

### Part III: Third-Party Plugins & Plugin Authoring
21. [Console Time (`telegraf-middleware-console-time`)](#21-console-time-telegraf-middleware-console-time)
22. [Useful Middlewares (`grammy-middlewares`)](#22-useful-middlewares-grammy-middlewares)
23. [Autoquote (`@roziscoding/grammy-autoquote`)](#23-autoquote-roziscodinggrammy-autoquote)
24. [Entity Parser (`@qz/telegram-entities-parser`)](#24-entity-parser-qztelegram-entities-parser)
25. [Developing Custom Plugins (`plugins/guide.md`)](#25-developing-custom-plugins-pluginsguidemd)

---

# Part I: Built-in Plugins (Core `"grammy"`)

Built-in plugins are included directly in the `grammy` package—do **not** install separate packages for them.

## 1. Sessions (`session`, `lazySession`, `enhanceStorage`)

Sessions persist per-chat or per-user state across updates (`ctx.session`).

### Basic Usage
```ts
import { Bot, Context, session, type SessionFlavor } from "grammy";

interface SessionData {
  pizzaCount: number;
}
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(
  session({
    initial: (): SessionData => ({ pizzaCount: 0 }),
  }),
);

bot.command("hunger", async (ctx) => {
  ctx.session.pizzaCount++;
  await ctx.reply(`You ate ${ctx.session.pizzaCount} pizzas!`);
});
```

### Session Keys (`getSessionKey`)
By default, sessions are stored per chat (`ctx.chat?.id.toString()`). You can customize `getSessionKey`:
```ts
// Store per-user across all chats:
function getUserSessionKey(ctx: Context): string | undefined {
  return ctx.from?.id.toString();
}

// Store per user+chat combination:
function getUserInChatKey(ctx: Context): string | undefined {
  return ctx.from === undefined || ctx.chat === undefined
    ? undefined
    : `${ctx.chat.id}/${ctx.from.id}`;
}
```
> **Warning**: Never access `ctx.session` when `getSessionKey(ctx)` returns `undefined` (e.g., on `inline_query` or `poll` updates with default chat-based keys), or grammY will throw an error! Also note that in channels or anonymous admin messages, `ctx.from` is absent (check `ctx.msg?.author_signature` if needed).

### Storage Adapters
- **In-Memory (Default)**: `new MemorySessionStorage()` (lost on restart; for dev only).
- **Free Cloud Storage (`@grammyjs/storage-free`)**: Zero-setup cloud storage tied to your bot token for hobby projects:
  ```ts
  import { freeStorage } from "@grammyjs/storage-free";
  bot.use(session({ initial: () => ({ count: 0 }), storage: freeStorage<SessionData>(bot.token) }));
  ```
- **Official External Storage Adapters (`@grammyjs/storage`)**: Supports Redis (`ioredis`), PostgreSQL, MongoDB, File System, Cloudflare D1, Cloudflare KV, Deno KV, Prisma, TypeORM, Supabase, Vercel KV, Memcached, S3, Firestore, Upstash, etc.
- **Custom Storage Adapter**: Any object implementing `StorageAdapter<T>` (`read(key)`, `write(key, value)`, `delete(key)`).

### Multi Sessions (`type: "multi"`)
Partition session data into independent fragments with different keys, initializers, and storage backends:
```ts
interface UserData { age?: number }
interface ChatData { welcomeText: string }
interface SessionData {
  user: UserData;
  chat: ChatData;
}
type MyContext = Context & SessionFlavor<SessionData>;

bot.use(
  session({
    type: "multi",
    user: {
      initial: () => ({}),
      getSessionKey: (ctx) => ctx.from?.id.toString(),
      prefix: "user/",
    },
    chat: {
      initial: () => ({ welcomeText: "Hello!" }),
      prefix: "chat/",
    },
  }),
);
```

### Lazy Sessions (`lazySession` & `LazySessionFlavor`)
Skips database read/write on updates that never touch `await ctx.session`:
```ts
import { Bot, Context, lazySession, type LazySessionFlavor } from "grammy";

type MyContext = Context & LazySessionFlavor<SessionData>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(lazySession({ initial: () => ({ pizzaCount: 0 }) }));

bot.command("eat", async (ctx) => {
  const session = await ctx.session; // Triggers DB read only here!
  session.pizzaCount++;
});
```

### Storage Enhancements (`enhanceStorage`: Timeouts & Migrations)
Wrap any storage adapter with `enhanceStorage` to add TTL (`millisecondsToLive`) and schema `migrations`:
```ts
import { enhanceStorage, type Enhance, MemorySessionStorage } from "grammy";

interface OldSession { count: number }
interface SessionData { pizzaCount: number }

const bot = new Bot<Context & SessionFlavor<SessionData>>(process.env.BOT_TOKEN!);

bot.use(
  session({
    initial: () => ({ pizzaCount: 0 }),
    storage: enhanceStorage({
      storage: new MemorySessionStorage<Enhance<SessionData>>(),
      millisecondsToLive: 60 * 60 * 1000, // 1 hour TTL
      migrations: {
        1: (old: OldSession): SessionData => ({ pizzaCount: old.count }),
      },
    }),
  }),
);
```

### Group-to-Supergroup Chat Migrations
When a regular group upgrades to a supergroup, Telegram assigns a new chat ID and sends `:migrate_to_chat_id` (on the old group) and `:migrate_from_chat_id` (on the new supergroup). Copy or migrate your session data in a `bot.on(":migrate_to_chat_id")` handler.

---

## 2. Inline & Custom Keyboards (`InlineKeyboard` & `Keyboard`)

> **Important**: You cannot send both an `InlineKeyboard` and a custom `Keyboard` in the same message, nor can you edit a custom keyboard message into an inline keyboard message.

### Inline Keyboards (`InlineKeyboard`)
Displayed directly underneath a message. Pressing a `.text()` button sends a `callback_query` update.

```ts
import { InlineKeyboard } from "grammy";

const inlineKeyboard = new InlineKeyboard()
  .text("« 1", "page:1")
  .text("· 2 ·", "page:2")
  .text("3 »", "page:3")
  .row()
  .url("Docs 📖", "https://grammy.dev")
  .webApp("Open App 📱", "https://example.com/webapp")
  .switchInline("Share in chat", "query_text")
  .switchInlineCurrent("Search here", "query_text")
  .switchInlineChosen("Share to groups", { allow_group_chats: true });

// Functional construction from arrays via InlineKeyboard.from():
const pairs = [["One", "1"], ["Two", "2"]];
const dynamicInline = InlineKeyboard.from([
  pairs.map(([label, data]) => InlineKeyboard.text(label, data)),
]);

// Send with message:
await ctx.reply("Choose an option:", { reply_markup: inlineKeyboard });

// Handle specific button clicks:
bot.callbackQuery("page:1", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Page 1 loaded!" });
});

// Handle regex button clicks:
bot.callbackQuery(/^page:(\d+)$/, async (ctx) => {
  const page = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Viewing page ${page}`, { reply_markup: inlineKeyboard });
});

// Catch-all for unhandled callback queries (removes client loading spinner):
bot.on("callback_query:data", async (ctx) => {
  console.log("Unhandled callback payload:", ctx.callbackQuery.data);
  await ctx.answerCallbackQuery();
});
```

### Custom Reply Keyboards (`Keyboard`)
Replaces the user's system keyboard. Pressing a button sends its label as a regular text message.

```ts
import { Keyboard } from "grammy";

const keyboard = new Keyboard()
  .text("Yes ✅").text("No ❌").row()
  .requestContact("Share Phone 📞")
  .requestLocation("Share Location 📍").row()
  .requestUsers("Pick a Friend 👥", 1, { user_is_bot: false })
  .requestChat("Pick a Group 💬", 2, { chat_is_channel: false })
  .requestPoll("Create Poll 📊", "regular")
  .resized()                     // Resize vertically to fit buttons
  .oneTime()                     // Hide immediately after 1 click
  .persistent()                  // Keep visible when system keyboard is hidden
  .placeholder("Choose Yes/No")  // Input field placeholder text
  .selected();                   // Show only to @-mentioned users or reply target

await ctx.reply("Confirm?", { reply_markup: keyboard });

// Functional construction from arrays:
const labels = ["Option A", "Option B"];
const fromArrayKb = Keyboard.from(labels.map((l) => [Keyboard.text(l)])).resized();

// Remove a custom keyboard (must be sent with a new message):
await ctx.reply("Keyboard removed.", {
  reply_markup: { remove_keyboard: true, selective: false },
});
```

---

## 3. Media Groups (`InputMediaBuilder`)

Media groups (albums of 2–10 photos, videos, documents, or audio files) are **built into core `grammy`** via `InputMediaBuilder`. (There is no `@grammyjs/media-group` package!)

```ts
import { InputFile, InputMediaBuilder } from "grammy";

// Send an album (2 to 10 items)
bot.command("album", async (ctx) => {
  await ctx.replyWithMediaGroup([
    InputMediaBuilder.photo("https://grammy.dev/images/Y.png", {
      caption: "grammY Logo",
    }),
    InputMediaBuilder.photo(new InputFile("/path/to/local.jpg")),
    InputMediaBuilder.video("https://example.com/demo.mp4", {
      has_spoiler: true,
    }),
  ]);
});

// Edit the media of an existing message
bot.callbackQuery("swap-photo", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageMedia(
    InputMediaBuilder.photo("https://grammy.dev/images/grammY.png", {
      caption: "Updated image!",
    }),
  );
});
```

> **Receiving Albums**: In Telegram's Bot API, an album sent by a user arrives as **separate individual `message` updates** sharing the same `ctx.msg.media_group_id`. Telegram never tells your bot how many items are in an album or which message is the last one. Design your bot to handle each file individually (or ask the user to press an Inline Keyboard button / send `/done` when finished uploading).

---

## 4. Inline Queries (`InlineQueryResultBuilder`)

Inline queries let users type `@your_bot query` in any chat. Requires enabling Inline Mode via `@BotFather` (`/setinline`).

```ts
import { InlineKeyboard, InlineQueryResultBuilder } from "grammy";

// 1. Match specific inline queries via string or RegExp
bot.inlineQuery(/best bot (framework|library)/i, async (ctx) => {
  const result = InlineQueryResultBuilder.article("id:grammy", "grammY", {
    description: "The Telegram Bot Framework",
    reply_markup: new InlineKeyboard().url("Website", "https://grammy.dev/"),
  }).text("<b>grammY</b> is the best way to build Telegram bots!", {
    parse_mode: "HTML",
  });

  // Build photo result that sends the photo itself:
  const photoResult = InlineQueryResultBuilder.photo(
    "id:logo",
    "https://grammy.dev/images/grammY.png",
  );

  // Build photo result that displays a photo preview but sends text when tapped:
  const photoTextResult = InlineQueryResultBuilder.photo(
    "id:logo-text",
    "https://grammy.dev/images/grammY.png",
  ).text("This text is sent instead of the photo!");

  // Build cached file result from an existing file_id:
  // InlineQueryResultBuilder.audioCached("id:audio", audioFileId);

  await ctx.answerInlineQuery([result, photoResult, photoTextResult], {
    cache_time: 30 * 24 * 3600,
    is_personal: false,
    next_offset: "page_2", // Pagination offset passed back in ctx.inlineQuery.offset
    button: {
      text: "Log in via private chat",
      start_parameter: "login", // Deep-links to /start login
    },
  });
});

// 2. Return empty results for unmatched inline queries
bot.on("inline_query", (ctx) => ctx.answerInlineQuery([]));

// 3. Handle the deep-linked button above inline results and return user to chat
bot
  .command("start")
  .filter((ctx) => ctx.match === "login", async (ctx) => {
    await ctx.reply("Authenticated! Click below to return to your chat:", {
      reply_markup: new InlineKeyboard().switchInline("Return to chat"),
    });
  });

// 4. Listen for chosen inline results (requires /setinlinefeedback in @BotFather)
bot.chosenInlineResult(/^id:/, async (ctx) => {
  console.log(`User chose ${ctx.chosenInlineResult.result_id} for query "${ctx.chosenInlineResult.query}"`);
});
```

---

# Part II: Official Plugins (`@grammyjs/*`)

## 5. Conversations 2.0 (`@grammyjs/conversations`)

The `conversations` plugin (`npm install @grammyjs/conversations`) lets you write multi-step conversational flows as normal sequential `async` functions with loops, branches, `try/catch`, forms, and conversational menus.

### Conversations 2.0 Architecture: Outside vs. Inside Context Types
In **Conversations 2.0**, the context type **outside** a conversation (`MyContext`) and the context type **inside** a conversation (`MyConversationContext`) are **distinct**:
- **Outside (`MyContext`)**: Wrapped with `ConversationFlavor<Context>` (adds `ctx.conversation.enter()`, `ctx.conversation.exit()`, `ctx.conversation.active()`).
- **Inside (`MyConversationContext`)**: Does NOT have `ConversationFlavor`, and only includes plugins explicitly installed on `createConversation(fn, { plugins: [...] })`.
- **No `session()` Required by Default**: Conversations 2.0 manages its own storage directly via `conversations({ storage: ... })` and does **not** require `bot.use(session())` unless your bot uses sessions separately.

```ts
import { Bot, Context } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";

// 1. Define Outside Context and Inside Context
type MyContext = ConversationFlavor<Context>;
type MyConversationContext = Context;
type MyConversation = Conversation<MyContext, MyConversationContext>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// 2. Define Conversation Builder Function
async function movieConversation(
  conversation: MyConversation,
  ctx: MyConversationContext,
) {
  await ctx.reply("What are your top 3 favorite movies?");
  const movies: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const titleCtx = await conversation.waitFor("message:text", {
      otherwise: (ctx) => ctx.reply("Please send a text message!"),
    });
    movies.push(titleCtx.message.text);
  }
  await ctx.reply(`Great taste! Your list: ${movies.join(", ")}`);
}

// 3. Install conversations() and register the conversation
bot.use(conversations());
bot.use(createConversation(movieConversation));

// 4. Enter the conversation from a normal handler
bot.command("movies", async (ctx) => {
  await ctx.conversation.enter("movieConversation");
});

bot.start();
```

### How the Replay Engine Works & The Three Golden Rules
When `await conversation.wait()` is reached, execution halts and the operation log is persisted. When the next update arrives, the conversation function is **replayed from the top**: previously completed `wait` and `ctx.api` calls resolve immediately from the persisted log without re-executing HTTP calls, until execution reaches the newly arrived `wait()`.

Because of replay, **ALL code inside a conversation function MUST obey the Three Golden Rules**:
1. **RULE 1**: Wrap ALL side effects (database reads/writes, external `fetch` calls, file system I/O, reading/writing `ctx.session`) inside `await conversation.external(...)`!
2. **RULE 2**: Wrap ALL randomness or timestamps inside `await conversation.random()` / `await conversation.now()` / `await conversation.sleep(ms)` / `await conversation.log(...)` (or `conversation.external()`).
3. **RULE 3**: Store all values received from `conversation.wait*()` or `conversation.external()` in local variables rather than mutating globals or closures outside the conversation.

```ts
// Wrapping external DB calls & custom serialization:
const userProfile = await conversation.external({
  task: () => db.users.findById(ctx.from!.id),
  beforeStore: (user) => JSON.stringify(user),
  afterLoad: (raw) => JSON.parse(raw),
});

// Deterministic helpers built into conversation:
const rnd = await conversation.random();        // Replay-safe Math.random()
const timestamp = await conversation.now();     // Replay-safe Date.now()
await conversation.sleep(2000);                 // Replay-safe 2s delay
await conversation.log("User profile:", userProfile); // Only logs on first execution!
```

### Waiting for Updates (`wait`, `waitFor`, `waitUntil`, `otherwise`)
Every `wait*` method returns a new `ctx` representing the newly received update:

```ts
// Wait for any update:
ctx = await conversation.wait();

// Wait for specific filter query with `otherwise` fallback:
const textCtx = await conversation.waitFor("message:text", {
  otherwise: (ctx) => ctx.reply("Please send text only!"),
});

// Wait for specific command, hears, or callback query:
const cmdCtx = await conversation.waitForCommand("confirm");
const hearsCtx = await conversation.waitForHears(/^yes$/i);
const cbCtx = await conversation.waitForCallbackQuery(/^item:(\d+)$/);

// Chained filters (.andForHears, .andFrom, etc.):
const replyFromSameUser = await conversation
  .waitFor(":text")
  .andFrom(ctx.from)
  .andForHears(/^secret/);

// Wait with custom predicate (waitUntil / waitUnless):
const photoWithCaption = await conversation.waitUntil(
  (ctx) => ctx.has(":photo") && Boolean(ctx.msg.caption),
  { otherwise: (ctx) => ctx.reply("Send a photo WITH a caption!") },
);

// Skip and pass update down to outside middleware:
// { otherwise: (ctx) => conversation.skip({ next: true }) }
```

### Leaving Conversations (`halt` vs. `exit`)
```ts
// Inside a conversation: immediately stop and exit
if (textCtx.msg.text === "/cancel") {
  await textCtx.reply("Cancelled.");
  await conversation.halt(); // Never returns!
}

// Outside a conversation (e.g. a /cancel command registered BEFORE createConversation):
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exit("movieConversation"); // or ctx.conversation.exitAll()
  await ctx.reply("Left conversation.");
});

// Inspect active conversations:
const stats = await ctx.conversation.active(); // Record<string, number>
const count = await ctx.conversation.active("movieConversation"); // number
```

### Persisting Conversations State (`conversations({ storage })`)
Always configure persistent storage in production and specify a `version` (bumping `version` cleanly invalidates incompatible in-flight conversation logs when you change conversation code):

```ts
import { MemorySessionStorage } from "grammy";
import { conversations, type ConversationData, type VersionedState } from "@grammyjs/conversations";

const storage = new MemorySessionStorage<VersionedState<ConversationData>>();

bot.use(
  conversations({
    storage: {
      type: "key",
      version: 1, // Increment when deploying breaking changes to conversation flow
      adapter: storage,
      prefix: "convo-",
    },
  }),
);
```

### Using Plugins & `ctx.session` Inside Conversations
Because the inside context is constructed fresh during replay, plugins installed via `bot.use()` on the outside bot are **not** automatically installed on `MyConversationContext`:

1. **Standard Plugins (e.g. `hydrate`, `i18n`)**: Pass to `plugins` array in `createConversation` (or `conversations({ plugins: [...] })`):
   ```ts
   type MyConversationContext = HydrateFlavor<Context>;
   bot.use(
     createConversation(myConvo, {
       id: "my-convo",
       plugins: [hydrate()],
     }),
   );
   ```
2. **Accessing `ctx.session` Inside a Conversation**: Use `conversation.external()` to read and write the outside `ctx.session`:
   ```ts
   // Read session from outside context:
   const session = await conversation.external((ctx) => ctx.session);

   // Modify session...
   session.score += 10;

   // Write session back to outside context:
   await conversation.external((ctx) => {
     ctx.session = session;
   });
   ```

### Conversational Forms (`conversation.form`)
Built-in validators that loop until the user provides valid input:
```ts
const name = await conversation.form.text({
  otherwise: (ctx) => ctx.reply("Please send plain text!"),
});
const age = await conversation.form.int({
  minimum: 18,
  maximum: 120,
  otherwise: (ctx) => ctx.reply("Enter a valid age between 18 and 120!"),
});
const choice = await conversation.form.select(["Small", "Medium", "Large"], {
  otherwise: (ctx) => ctx.reply("Pick Small, Medium, or Large!"),
});
const photos = await conversation.form.photo();

// Custom form field via conversation.form.build:
const positiveEven = await conversation.form.build(
  (ctx) => ctx.has(":text") ? Number(ctx.msg.text) : undefined,
  (val) => val !== undefined && !isNaN(val) && val > 0 && val % 2 === 0,
);
```

### Conversational Menus (`conversation.menu()`)
Create interactive inline menus scoped directly inside a conversation without colliding with `@grammyjs/menu`:
```ts
async function settingsConvo(conversation: MyConversation, ctx: MyConversationContext) {
  let notifications = true;

  const subMenu = conversation.menu("sub")
    .text("Action", (ctx) => ctx.reply("Done!"))
    .back("⬅️ Back");

  const mainMenu = conversation.menu("main", { autoAnswer: true })
    .text(
      () => (notifications ? "🔔 On" : "🔕 Off"),
      (ctx) => {
        notifications = !notifications;
        ctx.menu.update();
      },
    )
    .submenu("More ➡️", subMenu)
    .row()
    .text("Done ✅", (ctx) => ctx.menu.close());

  await ctx.reply("Configure your settings:", { reply_markup: mainMenu });
  await conversation.wait(); // Keep menu active while user interacts
}
```

### Wait Timeouts, Enter/Exit Hooks, Checkpoints & Rewind, Parallel Conversations
- **Wait Timeouts**: Pass `{ maxMilliseconds: 60_000 }` to `conversation.wait*()` or `createConversation(fn, { maxMillisecondsToWait: 300_000 })`. If the user takes longer, the conversation halts when their next message arrives and the update falls through to normal handlers.
- **Enter/Exit Hooks**:
  ```ts
  bot.use(conversations({
    onEnter: (id, ctx) => console.log(`Entering ${id}`),
    onExit: (id, ctx) => console.log(`Exiting ${id}`),
  }));
  ```
- **Concurrent Waits (`Promise.all`)**:
  ```ts
  const [textCtx, photoCtx] = await Promise.all([
    conversation.waitFor(":text"),
    conversation.waitFor(":photo"),
  ]); // Completes after user sends both a text and a photo in any order!
  ```
- **Checkpoints & Rewind** (Time-travel back to an earlier step in a conversation!):
  ```ts
  const startPoint = conversation.checkpoint();
  await ctx.reply("Send a destination:");
  const dest = await conversation.form.text();
  if (dest === "restart") {
    await conversation.rewind(startPoint); // Never returns; rewinds execution!
  }
  ```
- **Parallel Conversations**: Pass `createConversation(fn, { parallel: true })` so multiple conversations can be active simultaneously in the same chat.

---

## 6. Interactive Menus (`@grammyjs/menu`)

The `menu` plugin (`npm install @grammyjs/menu`) builds stateful, reactive inline keyboards with automatic callback routing, dynamic labels, and multi-level navigation without manual `bot.callbackQuery()` boilerplate.

```ts
import { Bot, Context } from "grammy";
import { Menu, MenuRange } from "@grammyjs/menu";

const bot = new Bot(process.env.BOT_TOKEN!);

// 1. Create Main Menu
const mainMenu = new Menu("root-menu", {
  autoAnswer: true,
  onMenuOutdated: "Updated menu! Please try again.",
})
  .text(
    (ctx) => `Hello ${ctx.from?.first_name ?? "User"}!`, // Dynamic label
    (ctx) => ctx.reply("Clicked greeting!"),
  )
  .row()
  .submenu("Credits ➡️", "credits-menu")
  .url("Website 🌐", "https://grammy.dev");

// 2. Create Submenu with Dynamic Range & Button Payloads
const creditsMenu = new Menu("credits-menu")
  .dynamic((ctx, range) => {
    // Dynamically generate buttons per render:
    for (const item of ["Alpha", "Beta", "Gamma"]) {
      range
        .text({ text: item, payload: item }, (ctx) => {
          const picked = ctx.match; // Reads button payload!
          ctx.reply(`Picked ${picked}`);
        })
        .row();
    }
  })
  .back("⬅️ Go Back");

// 3. Register Submenu & Mount Root Menu BEFORE handlers
mainMenu.register(creditsMenu);
bot.use(mainMenu);

bot.command("start", async (ctx) => {
  await ctx.reply("Check out this menu:", { reply_markup: mainMenu });
});
```

### Key Menu Operations
- `ctx.menu.update()`: Re-renders the menu in-place when state changes (or `await ctx.menu.update({ immediate: true })` to force immediate API call).
- `ctx.menu.close()`: Removes the inline keyboard from the message.
- `ctx.menu.nav("sub-id")` / `ctx.menu.back()`: Programmatically navigate between registered menus.
- **Custom Fingerprints**: `new Menu("id", { fingerprint: (ctx) => ctx.session.stateVersion })` detects outdated menus even when button layout looks identical.

---

## 7. Concurrent Runner (`@grammyjs/runner`)

Built-in `bot.start()` processes updates sequentially. For high-throughput long polling, install `@grammyjs/runner` (`npm install @grammyjs/runner`).

```ts
import { Bot, Context, session } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);

// 1. CRITICAL: Sequentialize updates that share state BEFORE session()!
// You can return a single string OR an array of strings (e.g. both chat and user):
bot.use(
  sequentialize((ctx) => {
    const chat = ctx.chat?.id.toString();
    const user = ctx.from?.id.toString();
    return [chat, user].filter((con): con is string => con !== undefined);
  }),
);

// 2. Install session AFTER sequentialize
bot.use(session({ initial: () => ({ count: 0 }) }));

bot.on("message", (ctx) => ctx.reply("Processed concurrently & safely!"));

// 3. Start the runner
const handle = run(bot, {
  runner: {
    fetch: { allowed_updates: ["message", "callback_query"] },
  },
  sink: {
    concurrency: 500, // Max concurrent updates in flight
  },
});

// Graceful shutdown
const stopRunner = () => handle.isRunning() && handle.stop();
process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);

// Wait for runner termination if needed:
// await handle.task();
```

### Multithreading with `BotWorker` and `distribute`
For CPU-intensive workloads, `@grammyjs/runner` can distribute updates across Node.js `worker_threads` or Deno `Web Worker`s:
```ts
// worker.ts
import { BotWorker } from "@grammyjs/runner";
const bot = new BotWorker(process.env.BOT_TOKEN!);
bot.on("message", (ctx) => ctx.reply("Handled in worker thread!"));

// index.ts (main thread)
import { Bot } from "grammy";
import { distribute, run } from "@grammyjs/runner";
const bot = new Bot(process.env.BOT_TOKEN!);
bot.use(distribute(__dirname + "/worker", { count: 4 }));
run(bot);
```

---

## 8. Commands (`@grammyjs/commands`)

The `commands` plugin (`npm install @grammyjs/commands`) supercharges command handling with BotFather-free menu synchronization (`setCommands`), chat scopes, multi-language localization, custom prefixes, mid-message matching, RegExp commands, and fuzzy typo suggestions (`commandNotFound`).

```ts
import { Bot, Context } from "grammy";
import {
  CommandGroup,
  commandNotFound,
  commands,
  type CommandsFlavor,
  LanguageCodes,
} from "@grammyjs/commands";

type MyContext = CommandsFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(commands());

const myCommands = new CommandGroup<MyContext>();

myCommands
  .command("hello", "Say hello")
  // Localize command name and description for Spanish users:
  .localize(LanguageCodes.Spanish, "hola", "Decir hola")
  // Restrict handler & menu visibility by scope:
  .addToScope(
    { type: "all_Private_chats" },
    (ctx) => ctx.reply(`Hello, private chat!`),
  )
  .addToScope(
    { type: "all_group_chats" },
    (ctx) => ctx.reply(`Hello, group ${ctx.chat.title}!`),
  );

// Custom prefixes (e.g., "!") or case-insensitivity:
myCommands.command(
  " status",
  "Check status",
  (ctx) => ctx.reply("OK"),
  { prefix: "!", ignoreCase: true, matchOnlyAtStart: false },
);

// RegExp commands (for handlers only; cannot be synced to Telegram menu):
myCommands
  .command(/delete_([a-zA-Z0-9]+)/, "Delete item")
  .addToScope({ type: "all_Private_chats" }, (ctx) => {
    await ctx.reply(`Deleting ${ctx.match[1]}`);
  });

bot.use(myCommands);

// Suggest closest known command when user makes a typo:
bot
  .filter(commandNotFound(myCommands, { similarityThreshold: 0.4 }))
  .use(async (ctx) => {
    if (ctx.commandSuggestion) {
      await ctx.reply(`Unknown command. Did you mean ${ctx.commandSuggestion}?`);
    } else {
      await ctx.reply("Unknown command.");
    }
  });

// Sync all scoped & localized commands to Telegram's native menu UI:
await myCommands.setCommands(bot);
```

---

## 9. Parse Mode & `FormattedString` (`@grammyjs/parse-mode`)

Instead of manually escaping MarkdownV2 or HTML characters (and risking `400 Bad Request: Cannot parse entities`), `@grammyjs/parse-mode` v2 (`npm install @grammyjs/parse-mode`) builds native Telegram `entities` arrays via the `fmt` tagged template and `FormattedString` class.

```ts
import {
  a,
  b,
  blockquote,
  code,
  expandableBlockquote,
  fmt,
  FormattedString,
  i,
  pre,
  spoiler,
  s,
  u,
} from "@grammyjs/parse-mode";

bot.command("format", async (ctx) => {
  const untrustedUserInput = "<script> & *weird_chars* [test]";

  // 1. Using `fmt` tagged template literal (auto-escapes and computes entities!):
  const message = fmt`${b}Hello ${ctx.from?.first_name}!${b}
Safe user input: ${code}${untrustedUserInput}${code}
Visit ${a("https://grammy.dev")}grammY Docs${a}!`;

  // Spread .text and .entities (NO parse_mode needed!):
  await ctx.reply(message.text, { entities: message.entities });

  // 2. Method chaining via FormattedString:
  const captionFmt = FormattedString.b("Photo Title\n")
    .plain("Normal text with ")
    .spoiler("hidden spoiler")
    .plain(" and ")
    .u("underlined text");

  // Spread .caption and .caption_entities for media methods:
  await ctx.replyWithPhoto("https://grammy.dev/images/Y.png", {
    caption: captionFmt.caption,
    caption_entities: captionFmt.caption_entities,
  });
});
```

---

## 10. Message Streaming (`@grammyjs/stream`)

The `stream` plugin (`npm install @grammyjs/stream`) streams large or dynamically generated text (such as LLM outputs) into Telegram using progressive message drafts (`sendMessageDraft`) and automatic 4,096-byte message splitting.

```ts
import { Bot, Context } from "grammy";
import { stream, type StreamFlavor } from "@grammyjs/stream";
import { streamText } from "ai";

type MyContext = StreamFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(stream());

// Stream an AsyncGenerator:
bot.command("story", async (ctx) => {
  async function* generateChunks() {
    yield "Once upon a time, ";
    await new Promise((r) => setTimeout(r, 500));
    yield "in a galaxy far, far away...";
  }
  await ctx.replyWithStream(generateChunks());
});

// Stream Markdown or HTML with Vercel AI SDK:
bot.command("ai", async (ctx) => {
  const result = streamText({
    model: myModel,
    prompt: ctx.match || "Explain grammY in 3 sentences.",
  });
  await ctx.replyWithMarkdownStream(result.textStream);
  // Or: await ctx.replyWithHtmlStream(result.textStream);
});
```

---

## 11. Internationalization (`@grammyjs/i18n` & `@grammyjs/fluent`)

Prefer `@grammyjs/i18n` (`npm install @grammyjs/i18n`) for both Node.js and Deno. It uses Mozilla's [Project Fluent](https://projectfluent.org/) (`.ftl` files).

### Example `locales/en.ftl`
```ftl
-bot-name = CartBot
start = Hello { $name }, welcome to { -bot-name }!
cart = You have { NUMBER($items) ->
    [0] no items
    [one] { $items } item
   *[other] { $items } items
} in your cart.
```

### Usage with `@grammyjs/i18n`
```ts
import { Bot, Context, session, SessionFlavor } from "grammy";
import { I18n, I18nFlavor } from "@grammyjs/i18n";

interface SessionData { __language_code?: string }
type MyContext = Context & SessionFlavor<SessionData> & I18nFlavor;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

const i18n = new I18n<MyContext>({
  defaultLocale: "en",
  directory: "locales",
  useSession: true, // Persist language changes in ctx.session.__language_code
  fluentBundleOptions: { useIsolating: false },
});

bot.use(session({ initial: () => ({}) }));
bot.use(i18n);

bot.command("start", async (ctx) => {
  await ctx.reply(ctx.t("start", { name: ctx.from?.first_name ?? "friend" }));
});

bot.command("lang_es", async (ctx) => {
  await ctx.i18n.setLocale("es");
  await ctx.reply(ctx.t("start", { name: ctx.from?.first_name ?? "amigo" }));
});

// Match localized custom keyboard button labels across all locales!
bot.hears(i18n.hears("cart_btn"), async (ctx) => {
  await ctx.reply(ctx.t("cart", { items: 3 }));
});
```

---

## 12. Chat Members (`@grammyjs/chat-members`)

Simplifies `chat_member` and `my_chat_member` status transitions (`in`, `out`, `free`, `admin`, `regular`, `restricted_in`, `restricted_out`), hydrates `ChatMember` objects with `.is()`, and caches chat members in storage.

```ts
import { API_CONSTANTS, Api, Bot, Context, MemorySessionStorage } from "grammy";
import type { ChatMember } from "grammy/types";
import {
  chatMemberFilter,
  chatMemberIs,
  chatMembers,
  type ChatMembersFlavor,
  hydrateChatMember,
  type HydrateChatMemberApiFlavor,
  type HydrateChatMemberFlavor,
  myChatMemberFilter,
} from "@grammyjs/chat-members";

type MyContext = HydrateChatMemberFlavor<Context & ChatMembersFlavor>;
type MyApi = HydrateChatMemberApiFlavor<Api>;

const bot = new Bot<MyContext, MyApi>(process.env.BOT_TOKEN!);
const adapter = new MemorySessionStorage<ChatMember>();

bot.api.config.use(hydrateChatMember());
bot.use(chatMembers(adapter));

const groups = bot.chatType(["group", "supergroup"]);

// React when any user joins the group ("out" -> "in"):
groups.filter(chatMemberFilter("out", "in"), async (ctx) => {
  const user = ctx.chatMember.new_chat_member.user;
  await ctx.reply(`Welcome ${user.first_name}!`);
});

// React when the bot itself is promoted to admin:
groups.filter(myChatMemberFilter("regular", "admin"), async (ctx) => {
  await ctx.reply("Thanks for promoting me to admin!");
});

// Check admin status inside a command using hydrated .is():
groups.command("ban", async (ctx) => {
  const author = await ctx.getAuthor();
  if (!author.is("admin")) {
    return ctx.reply("Only admins can use /ban!");
  }
  // Read cached chat member from storage adapter:
  const member = await ctx.chatMembers.getChatMember();
});

// IMPORTANT: Must include "chat_member" in allowed_updates!
bot.start({
  allowed_updates: [...API_CONSTANTS.DEFAULT_UPDATE_TYPES, "chat_member"],
});
```

---

## 13. Hydration (`@grammyjs/hydrate`)

Attaches convenience methods (`.editText()`, `.delete()`, `.answer()`, etc.) directly onto objects inside `ctx` and returned by API calls.

```ts
import { Api, Bot, Context } from "grammy";
import {
  hydrate,
  hydrateApi,
  type HydrateApiFlavor,
  hydrateContext,
  type HydrateFlavor,
} from "@grammyjs/hydrate";

// Simple Installation (hydrates ctx and ctx.api results):
type MyContext = HydrateFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
bot.use(hydrate());

// Advanced Installation (also hydrates standalone bot.api.* results):
// type MyApi = HydrateApiFlavor<Api>;
// const bot = new Bot<MyContext, MyApi>(process.env.BOT_TOKEN!);
// bot.use(hydrateContext());
// bot.api.config.use(hydrateApi());

bot.on(":photo", async (ctx) => {
  const statusMsg = await ctx.reply("Processing...");
  await statusMsg.editText("Done!");
  setTimeout(() => statusMsg.delete().catch(() => {}), 3000);
});
```

---

## 14. Files (`@grammyjs/files`)

Adds `.download(path?)` and `.getUrl()` to `getFile()` results.

```ts
import { Api, Bot, Context } from "grammy";
import { type FileApiFlavor, type FileFlavor, hydrateFiles } from "@grammyjs/files";

type MyContext = FileFlavor<Context>;
type MyApi = FileApiFlavor<Api>;

const bot = new Bot<MyContext, MyApi>(process.env.BOT_TOKEN!);
bot.api.config.use(hydrateFiles(bot.token));

bot.on([":video", ":animation", ":photo"], async (ctx) => {
  const file = await ctx.getFile();
  const url = file.getUrl(); // Valid for >= 1 hour (or local path on Local Bot API Server)
  const savedPath = await file.download(); // Downloads to temp file or custom path
  console.log("Downloaded to:", savedPath);
});
```

---

## 15. Auto-Retry (`@grammyjs/auto-retry`)

An API transformer (`npm install @grammyjs/auto-retry`) that automatically intercepts `429 Too Many Requests` (`retry_after`), waits the required duration, and retries the request. Also retries `5xx` internal server errors and `HttpError` network errors using exponential backoff (starting at 3s, capped at 1 hour).

```ts
import { autoRetry } from "@grammyjs/auto-retry";

bot.api.config.use(
  autoRetry({
    maxRetryAttempts: 3,               // Max retries per request
    maxDelaySeconds: 60,               // Fail immediately if retry_after > 60s
    rethrowInternalServerErrors: false, // Set true to not retry 5xx errors
    rethrowHttpErrors: false,           // Set true to not retry network errors
  }),
);
```

---

## 16. Flood Control (`@grammyjs/transformer-throttler`)

Enqueues outgoing API requests using `Bottleneck` (`npm install @grammyjs/transformer-throttler`) to proactively stay within Telegram's documented rate limits (30 msgs/sec global, 20 msgs/min per group, 1 msg/sec per private chat). Pair with `autoRetry()` for complete flood safety.

```ts
import { apiThrottler } from "@grammyjs/transformer-throttler";

const throttler = apiThrottler({
  global: { reservoir: 30, reservoirRefreshAmount: 30, reservoirRefreshInterval: 1000 },
  group: { maxConcurrent: 1, minTime: 1000, reservoir: 20, reservoirRefreshAmount: 20, reservoirRefreshInterval: 60000 },
  out: { maxConcurrent: 1, minTime: 1000 },
});
bot.api.config.use(throttler);
```

---

## 17. User Rate Limiter (`@grammyjs/ratelimiter`)

Inbound middleware (`npm install @grammyjs/ratelimiter`) that throttles spammy users by `from.id` (or `chat.id`) in memory or Redis (`ioredis`).

```ts
import { limit } from "@grammyjs/ratelimiter";

bot.use(
  limit({
    timeFrame: 2000, // 2 seconds
    limit: 3,        // Max 3 updates per 2 seconds
    storageClient: "MEMORY_STORE", // Or pass an ioredis instance for multi-instance clusters
    onLimitExceeded: async (ctx) => {
      await ctx.reply("Please refrain from sending too many requests!");
    },
    keyGenerator: (ctx) => ctx.from?.id.toString(),
  }),
);
```

---

## 18. Emoji (`@grammyjs/emoji`)

Autocomplete emoji names in template strings and reaction handlers (`npm install @grammyjs/emoji`).

```ts
import { Bot, Context } from "grammy";
import { type EmojiFlavor, emojiParser, Reactions } from "@grammyjs/emoji";

type MyContext = EmojiFlavor<Context>;
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(emojiParser());

bot.command("ping", async (ctx) => {
  await ctx.replyWithEmoji`Pong ${"ping_pong"}!`;
  await ctx.react(Reactions.thumbs_up);
});
```

---

## 19. Router (`@grammyjs/router`)

Routes updates into branches based on a selector function (`npm install @grammyjs/router`). *(Note: For multi-step forms, prefer `@grammyjs/conversations` over session-based routers).*

```ts
import { Router } from "@grammyjs/router";

const router = new Router<MyContext>((ctx) => ctx.session.mode);
router.route("admin", async (ctx) => ctx.reply("Admin mode"));
router.route("user").on("message:text", async (ctx) => ctx.reply("User text"));
router.otherwise((ctx) => ctx.reply("Unknown mode"));

bot.use(router);
```

---

## 20. Stateless Question (`@grammyjs/stateless-question`)

Creates stateless force-reply questions (`npm install @grammyjs/stateless-question`) that work in group privacy mode without database storage by appending an invisible zero-width non-joiner identifier suffix to the question text.

```ts
import { StatelessQuestion } from "@grammyjs/stateless-question";

const unicornQuestion = new StatelessQuestion("unicorns", async (ctx) => {
  console.log("User answered:", ctx.message.text);
});

bot.use(unicornQuestion.middleware());

bot.command("ask", async (ctx) => {
  await unicornQuestion.replyWithMarkdown(ctx, "What are unicorns doing?");
});
```

---

# Part III: Third-Party Plugins & Plugin Authoring

## 21. Console Time (`telegraf-middleware-console-time`)

Logs update timing and profiles slow middleware during development (`npm install telegraf-middleware-console-time`):

```ts
import {
  generateAfterMiddleware,
  generateBeforeMiddleware,
  generateUpdateMiddleware,
} from "telegraf-middleware-console-time";

if (process.env.NODE_ENV !== "production") {
  bot.use(generateUpdateMiddleware());
}

// Profile a specific middleware "db-load":
bot.use(generateBeforeMiddleware("db-load"));
bot.use(myMiddleware);
bot.use(generateAfterMiddleware("db-load"));
```

---

## 22. Useful Middlewares (`grammy-middlewares`)

Collection of common guard middlewares (`npm install grammy-middlewares`):

```ts
import {
  ignoreOld,
  onlyAdmin,
  onlyPublic,
  onlySuperAdmin,
  sequentialize,
} from "grammy-middlewares";

bot.use(
  ignoreOld(5 * 60), // Ignore updates older than 5 minutes
  onlyPublic((ctx) => ctx.reply("Group/channel only!")),
  onlyAdmin((ctx) => ctx.reply("Admins only!")),
  onlySuperAdmin(Number(process.env.SUPER_ADMIN_ID)),
  sequentialize(),
);
```

---

## 23. Autoquote (`@roziscoding/grammy-autoquote`)

Automatically injects `reply_parameters` into outgoing `reply*` / `send*` calls so the bot always quotes the triggering message (`npm install @roziscoding/grammy-autoquote`):

```ts
import { addReplyParam, autoQuote } from "@roziscoding/grammy-autoquote";

// Apply globally to every handler:
bot.use(autoQuote({ allowSendingWithoutReply: true }));

// Or apply only inside a specific handler:
bot.command("quote", async (ctx) => {
  ctx.api.config.use(addReplyParam(ctx));
  await ctx.reply("This automatically quotes your command!");
});
```

---

## 24. Entity Parser (`@qz/telegram-entities-parser`)

Converts Telegram message `entities` into sanitized, semantic HTML (`npx jsr add @qz/telegram-entities-parser`).
> **When to use**: ONLY when rendering Telegram messages **outside Telegram** (e.g., on a web dashboard). Inside Telegram, use `ctx.copyMessage(chatId)`, `ctx.forwardMessage(chatId)`, or `@grammyjs/parse-mode` instead!

```ts
import { EntitiesParser, RendererHtml } from "@qz/telegram-entities-parser";

const entitiesParser = new EntitiesParser();

bot.on([":text", ":photo"], (ctx) => {
  const html = entitiesParser.parse({ message: ctx.msg });
  console.log("Sanitized HTML for web display:", html);
});
```

---

## 25. Developing Custom Plugins (`plugins/guide.md`)

grammY plugins fall into two categories (or combine both):

1. **Middleware Plugin** (intercepts incoming updates; installed via `bot.use()`):
   ```ts
   import type { Context, Middleware } from "grammy";

   export function onlyUsersNamed<C extends Context>(substr: string): Middleware<C> {
     return async (ctx, next) => {
       if (ctx.from?.first_name.includes(substr)) {
         await next();
       }
     };
   }
   ```
2. **Transformer Plugin** (intercepts outgoing API calls; installed via `bot.api.config.use()`):
   ```ts
   import type { Transformer } from "grammy";

   export function autoChatAction(): Transformer {
     return async (prev, method, payload, signal) => {
       let handle: ReturnType<typeof setInterval> | undefined;
       if (method === "sendDocument" && "chat_id" in payload) {
         handle = setInterval(() => {
           prev("sendChatAction", { chat_id: payload.chat_id, action: "upload_document" }).catch(console.error);
         }, 5000);
       }
       try {
         return await prev(method, payload, signal);
       } finally {
         clearInterval(handle);
       }
     };
   }
   ```
3. **Packaging for Deno & Node.js**: Official grammY plugins use the [`grammyjs/plugin-template`](https://github.com/grammyjs/plugin-template) structure (`src/deps.deno.ts`, `src/deps.node.ts`, `src/index.ts`) and transpile Deno TypeScript to Node.js packages using `deno2node`.
