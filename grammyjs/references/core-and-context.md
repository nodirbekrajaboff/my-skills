# Core Concepts, Context, Filter Queries, Files, Reactions & Error Handling

## Table of Contents

1. [Getting Started & Runtimes](#1-getting-started--runtimes)
2. [Basics: Sending, Receiving, and Replying](#2-basics-sending-receiving-and-replying)
3. [The Context Object (`ctx`), Shortcuts & Flavors](#3-the-context-object-ctx-shortcuts--flavors)
4. [The Bot API (`bot.api` vs `ctx.api`), Raw Calls & Local Bot API Server](#4-the-bot-api-botapi-vs-ctxapi-raw-calls--local-bot-api-server)
5. [Filter Queries (`bot.on()`) & `matchFilter`](#5-filter-queries-boton--matchfilter)
6. [Commands & Deep Linking](#6-commands--deep-linking)
7. [The Middleware Stack](#7-the-middleware-stack)
8. [Reactions (`ctx.react`, `bot.reaction`, `ctx.reactions`)](#8-reactions-ctxreact-botreaction-ctxreactions)
9. [Error Handling (`bot.catch` & `bot.errorBoundary`)](#9-error-handling-botcatch--boterrorboundary)
10. [File Handling (`file_id`, Downloading, `InputFile`)](#10-file-handling-file_id-downloading-inputfile)
11. [HTML5 Games (`guide/games.md`)](#11-html5-games-guidegamesmd)

---

## 1. Getting Started & Runtimes

grammY is written in pure TypeScript with a Deno-first architecture and first-class support for Node.js, Bun, and modern edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge, Supabase Edge Functions).

### Installation & Imports by Runtime

```ts
// Node.js / Bun (npm install grammy)
import { Bot, Context } from "grammy";
import type { Message, Update } from "grammy/types";

// Deno (no install step required, or `deno add npm:grammy`)
import { Bot, Context } from "npm:grammy";
import type { Message, Update } from "npm:grammy/types";
```

### Enabling Debug Logging

Set the `DEBUG` environment variable before starting your bot to inspect internal update fetching, middleware execution, and API calls:

```sh
export DEBUG="grammy*"
# Node.js:
node bot.js
# Deno (requires --allow-env / -E):
deno -EIN bot.ts
```

---

## 2. Basics: Sending, Receiving, and Replying

### Receiving Messages
```ts
const bot = new Bot(process.env.BOT_TOKEN!);

// Command listener (/start)
bot.command("start", async (ctx) => {
  await ctx.reply("Welcome! Up and running.");
});

// Exact string or RegExp text listener
bot.hears(/ping/i, async (ctx) => {
  await ctx.reply("Pong!");
});

// Any message listener
bot.on("message", async (ctx) => {
  const message = ctx.message; // the message object
  await ctx.reply("Got another message!");
});

bot.start();
```

### Sending Messages & the `other` Options Object
All API methods in grammY take positional required arguments followed by an optional `other` options object matching the Telegram Bot API specification (`Other<...>`) as the final parameter:

```ts
// Standalone API call (requires chat_id)
await bot.api.sendMessage(12345, "Hi!");

// Context action shortcut (automatically uses current chat_id)
const sentMessage = await ctx.reply("Hi! *Bold* text", {
  parse_mode: "MarkdownV2",
  // Reply to the incoming message (Bot API 7.0+ reply_parameters)
  reply_parameters: {
    message_id: ctx.msg.message_id,
    allow_sending_without_reply: true,
  },
  // Control link previews (Bot API 7.0+ link_preview_options)
  link_preview_options: {
    is_disabled: true,
  },
  // Force the user's client to open a reply input field
  reply_markup: {
    force_reply: true,
    selective: true,
  },
});
```

---

## 3. The Context Object (`ctx`), Shortcuts & Flavors

Whenever Telegram sends an `Update` to your bot, grammY wraps it in a `Context` instance (`ctx`). A fresh `ctx` is created once per incoming update and passed through all middleware layers.

### Main Context Properties
- `ctx.update`: The raw `Update` object from Telegram (`update_id` plus exactly one update field such as `message`, `edited_message`, `callback_query`, `inline_query`, `message_reaction`, etc.).
- `ctx.api`: An `Api` instance pre-configured with context-scoped transformers (used internally by `ctx.reply`, `ctx.deleteMessage`, etc.).
- `ctx.me`: Your bot's `UserFromGetMe` profile (`id`, `username`, `first_name`, `is_bot`, etc.), initialized via `getMe` before processing updates.

### All 10 Official Context Shortcuts (`guide/context.md`)

Context shortcuts aggregate data across multiple update types so you don't have to branch on `ctx.message ?? ctx.editedMessage ?? ctx.channelPost`:

| Shortcut | Extracted Value & Supported Update Types |
| :--- | :--- |
| `ctx.msg` | The message object from `message`, `edited_message`, `channel_post`, `edited_channel_post`, `business_message`, `edited_business_message`, or `callback_query.message`. |
| `ctx.msgId` | The `message_id` from any update with `ctx.msg`, OR from `message_reaction` and `message_reaction_count` updates. |
| `ctx.chat` | The `Chat` object from any update with `ctx.msg`, `message_reaction`, `message_reaction_count`, `chat_member`, `my_chat_member`, `chat_join_request`, `chat_boost`, or `removed_chat_boost`. |
| `ctx.chatId` | The `chat.id` from any update with `ctx.chat`, OR from `deleted_business_messages` updates. |
| `ctx.senderChat` | The `ctx.msg.sender_chat` (for channel posts or anonymous group admins), `message_reaction.actor_chat`, or `chat_boost.boost.source.chat`. |
| `ctx.from` | The `User` who triggered the update across messages, callback queries, inline queries, chosen inline results, shipping/pre-checkout queries, reactions (`ctx.messageReaction.user`), chat member updates, and poll answers. |
| `ctx.inlineMessageId` | The `inline_message_id` from `callback_query` or `chosen_inline_result` updates on inline messages. |
| `ctx.businessConnectionId` | The `business_connection_id` from `ctx.msg`, `business_connection`, or `deleted_business_messages` updates. |
| `ctx.entities(types?)` | Extracts `msg.entities` or `msg.caption_entities` and augments each entity with `.text` (the sliced substring directly from the message text/caption!). Pass an array like `ctx.entities(["url", "email"])` to filter. |
| `ctx.reactions()` | Computes a rich 10-property diff object (`emoji`, `emojiAdded`, `emojiKept`, `emojiRemoved`, `customEmoji*`, `paid`, `paidAdded`) from `message_reaction` updates. |

```ts
// Example: Extracting URL and email strings without manual offset/length slicing
bot.on("message", (ctx) => {
  for (const entity of ctx.entities(["url", "email"])) {
    console.log(`Found ${entity.type}: ${entity.text}`);
  }
});
```

### Probing via `ctx.has*` Methods & `Context.has` Predicates

Inside a handler or general middleware, you can narrow the `ctx` type dynamically using `ctx.has*` methods (which replicate Composer filter logic as TypeScript type guards):

```ts
bot.use(async (ctx) => {
  if (ctx.has(":text")) {
    ctx.msg.text; // TypeScript knows this is string!
  }
  if (ctx.hasCommand("start")) {
    ctx.match; // TypeScript knows ctx.match is string!
  }
  if (ctx.hasChatType(["group", "supergroup"])) {
    ctx.chat.title; // Narrowed to group/supergroup chat
  }
  if (ctx.hasCallbackQuery(/^item-(\d+)$/)) {
    ctx.match[1]; // RegExpMatchArray!
  }
  if (ctx.hasReaction("🎉")) {
    // Narrowed to reaction update
  }
});
```

You can also create reusable predicate functions via the static `Context.has` property for `bot.filter()`:

```ts
const hasNumericCallback = Context.has.callbackQuery(/^\d+$/);
bot.filter(hasNumericCallback, (ctx) => {
  console.log("Numeric payload:", ctx.match[0]);
});
```

### Context Flavors (Additive vs. Transformative)

Context flavors type custom properties and methods installed on `ctx` by plugins or your own middleware:

1. **Additive Context Flavors** (only add new properties to `ctx`; combine via `&`):
   ```ts
   import { Context, SessionFlavor } from "grammy";
   import { I18nFlavor } from "@grammyjs/i18n";

   interface SessionData { count: number }
   type MyContext = Context & SessionFlavor<SessionData> & I18nFlavor;
   ```
2. **Transformative Context Flavors** (modify existing methods/return types on `ctx`; wrap via `Flavor<...>`):
   ```ts
   import { HydrateFlavor } from "@grammyjs/hydrate";
   import { EmojiFlavor } from "@grammyjs/emoji";
   import { ConversationFlavor } from "@grammyjs/conversations";

   // Wrap the additive base type inside transformative flavors:
   type MyContext = ConversationFlavor<
     HydrateFlavor<EmojiFlavor<Context & SessionFlavor<SessionData>>>
   >;
   ```

### Customizing the Context Class (`contextConstructor`)

Instead of (or in addition to) middleware-attached properties, you can subclass `Context` and pass `contextConstructor` to `new Bot()`:

```ts
import { Api, Bot, Context } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";

class CustomContext extends Context {
  constructor(update: Update, api: Api, me: UserFromGetMe) {
    super(update, api, me);
  }
  replyWithCustomFormat(text: string) {
    return this.reply(`✨ ${text}`);
  }
}

const bot = new Bot(process.env.BOT_TOKEN!, {
  ContextConstructor: CustomContext,
});
```

---

## 4. The Bot API (`bot.api` vs `ctx.api`), Raw Calls & Local Bot API Server

### `bot.api` vs. `ctx.api` vs. `ctx.reply`
- **`ctx.reply(...)` / Context Actions**: Prefer inside handlers. Automatically fills `chat_id` (and `business_connection_id` or `message_thread_id` where relevant).
- **`ctx.api.sendMessage(...)`**: Use inside handlers when targeting a different chat or calling an API method without a direct shortcut on `ctx`. Runs through context-level transformers (`ctx.api.config.use`).
- **`bot.api.sendMessage(...)`**: Use outside update handlers (e.g., cron jobs, background workers, startup scripts).

### Raw API Calls (`bot.api.raw` / `ctx.api.raw`)
All arguments in `bot.api.raw.*` are passed as a single flat JSON object matching the raw Telegram HTTP API:

```ts
await bot.api.raw.sendMessage({
  chat_id: 12345,
  text: "Sent via raw API",
});
```

### Data Center Location & Local Bot API Server (`guide/api.md`)
- **Telegram Bot API Server Location**: Telegram's official Bot API server is located in **Amsterdam, Netherlands**. Host your VPS or serverless functions as close to Amsterdam (`ams` / `eu-west` / `fra`) as possible to minimize network latency on every API call and webhook hop.
- **Running a Local Bot API Server**:
  Running your own [Telegram Bot API Server](https://core.telegram.org/bots/api#using-a-local-bot-api-server) unlocks:
  - Downloading files without size limits (vs. 20 MB limit).
  - Uploading files up to 2,000 MB (vs. 50 MB limit).
  - Uploading files using local file paths and `file://` URIs without streaming over HTTP.
  - Up to 100,000 max `webhook_connections` and any HTTP webhook port.
  - **Switching to a Local Server**:
    1. Call `await bot.api.logOut()` once against `https://api.telegram.org` before migrating your running bot to the local server.
    2. Point grammY to the local `apiRoot`:
       ```ts
       const bot = new Bot(process.env.BOT_TOKEN!, {
         client: {
           apiRoot: "http://localhost:8081",
         },
       });
       ```
    3. If you switch back to `api.telegram.org`, call `await bot.api.close()` on the local server first.

---

## 5. Filter Queries (`bot.on()`) & `matchFilter`

grammY provides a type-safe query language (`FilterQuery`) with up to 3 levels (`L1:L2:L3`) that validates queries at **compile time** and narrows `ctx` to the exact properties guaranteed to exist.

### Query Levels (`L1:L2:L3`)
- **Level 1 (Update Type)**: `message`, `edited_message`, `channel_post`, `edited_channel_post`, `business_message`, `edited_business_message`, `inline_query`, `chosen_inline_result`, `callback_query`, `shipping_query`, `pre_checkout_query`, `poll`, `poll_answer`, `my_chat_member`, `chat_member`, `chat_join_request`, `message_reaction`, `message_reaction_count`, `chat_boost`, `removed_chat_boost`, `deleted_business_messages`, `purchased_paid_media`.
- **Level 2 (Message / Update Property)**: `:text`, `:photo`, `:video`, `:audio`, `:voice`, `:document`, `:sticker`, `:animation`, `:video_note`, `:contact`, `:location`, `:venue`, `:poll`, `:dice`, `:game`, `:invoice`, `:successful_payment`, `:refunded_payment`, `:entities`, `:caption_entities`, `:caption`, `:new_chat_members`, `:left_chat_member`, `:Pinned_message`, `:forum_topic_created`, `:web_app_data`, `:data` (for `callback_query`), `:new_reaction` / `:old_reaction` (for `message_reaction`), etc.
- **Level 3 (Entity / Sub-Property)**: `:url`, `:email`, `:bot_command`, `:mention`, `:text_mention`, `:hashtag`, `:cashtag`, `:phone_number`, `:bold`, `:italic`, `:code`, `:pre`, `:spoiler`, `:custom_emoji`, `:is_bot`, `:me`, `:is_premium`, `:emoji`, `:paid`, etc.

### Leaving Out Levels
You can omit L1 or L2 as long as the colons remain:
- `":text"` → Matches both `message:text` AND `channel_post:text` (plus `business_message:text`).
- `"message::url"` → Matches `message:entities:url` OR `message:caption_entities:url` (URL in text OR caption!).
- `"::email"` → Matches an email entity in text OR caption of a message OR channel post!

### Built-in Query Shortcuts

| Shortcut | Expands To | Description |
| :--- | :--- | :--- |
| `"msg"` | `message` \| `channel_post` \| `business_message` | Any new message, channel post, or business message (`ctx.msg` is defined). |
| `"edit"` | `edited_message` \| `edited_channel_post` \| `edited_business_message` | Any edited message, channel post, or business message (`ctx.msg` is defined). |
| `":media"` | `:photo` \| `:video` | Any photo or video message. |
| `":file"` | `:photo` \| `:animation` \| `:audio` \| `:document` \| `:video` \| `:video_note` \| `:voice` \| `:sticker` | Any update containing a downloadable file (guarantees `await ctx.getFile()` works!). |

### Syntactic Sugar Sub-Queries (L3)
- **`:is_bot`**: E.g., `"message:new_chat_members:is_bot"` matches when at least one newly joined user is a bot.
- **`:me`**: E.g., `"message:new_chat_members:me"` or `"message:left_chat_member:me"` matches when **your own bot** joins or is removed from a chat.
- **`:is_premium`**: E.g., `"msg:from:is_premium"` matches messages sent by Telegram Premium users.

### Combining Queries (OR vs. AND)

```ts
// Logical OR: Pass an array of filter queries to a single .on()
bot.on(["message:text", "edited_message:text"], async (ctx) => {
  // Executes if update is a text message OR an edited text message
});

// Logical AND: Chain multiple .on() calls
bot
  .on("::url")       // Must contain a URL entity in text or caption
  .on(":forward_origin") // AND must be a forwarded message
  .on(":photo", async (ctx) => {
    // AND must be a photo!
  });
```

### Filtering by Message Sender Type (`guide/filter-queries.md`)

There are five types of message authors on Telegram, and you can distinguish them purely with filter queries:

1. **Channel post authors**: `bot.on("channel_post")`
2. **Automatic forwards from linked channels in discussion groups**: `bot.on("message:is_automatic_forward")`
3. **Regular users in private/group chats**: `bot.on("message").drop((ctx) => ctx.msg.sender_chat !== undefined)`
4. **Anonymous admins sending on behalf of the group**: `bot.on("message:sender_chat").filter((ctx) => ctx.msg.sender_chat.id === ctx.chat.id)`
5. **Users sending messages as a channel in a group**: `bot.on("message:sender_chat").filter((ctx) => ctx.msg.sender_chat.id !== ctx.chat.id)`

### Using `matchFilter` & `Filter<C, Q>` Type Helper

To extract filter query logic into standalone predicates or drop matching updates:

```ts
import { Bot, Context, Filter, matchFilter } from "grammy";

// Drop all channel posts and edited messages
bot.drop(matchFilter(["channel_post", "edit"]));

// Type a standalone helper function expecting a narrowed context:
function handlePhoto(ctx: Filter<Context, "message:photo">) {
  const largestPhoto = ctx.message.photo.at(-1)!;
  console.log(largestPhoto.file_id);
}
bot.on("message:photo", handlePhoto);
```

---

## 6. Commands & Deep Linking

### Handling Commands
```ts
// Single command (/start) or array of commands (["help", "info"])
bot.command("start", async (ctx) => {
  const payload = ctx.match; // Everything after "/start " as a string
  await ctx.reply(`Started with payload: ${payload}`);
});
```

> **Note**: Core `bot.command()` only matches commands at the very beginning of a message (`offset === 0`). To match commands in the middle of messages, custom prefixes (`!`, `?`), localized commands, scopes, or fuzzy command suggestions, use the official [`@grammyjs/commands`](./plugins-guide.md#14-commands-plugin-grammyjscommands) plugin.

### Deep Linking Support
Telegram supports two deep link formats:
- Private chat: `https://t.me/<bot_username>?start=<payload>`
- Group chat: `https://t.me/<bot_username>?startgroup=<payload>`

Payloads can be up to **64 characters** (`A-Z`, `a-z`, `0-9`, `_`, `-`). When the user clicks the link, Telegram sends `/start <payload>`, and grammY populates `ctx.match` with `<payload>`:

```ts
bot.command("start", async (ctx) => {
  if (ctx.match === "ref_campaign_42") {
    await ctx.reply("Welcome from Campaign 42!");
    return;
  }
  await ctx.reply("Welcome!");
});
```

---

## 7. The Middleware Stack

Middleware in grammY is either a `MiddlewareFn<C>` (`(ctx: C, next: NextFunction) => MaybePromise<unknown>`) or a `MiddlewareObj<C>` (an object with `.middleware()`, such as `Composer`, `Menu`, or `Router`).

```ts
bot.use(async (ctx, next) => {
  const before = Date.now();
  await next(); // CRITICAL: Always `await` next()!
  console.log(`Update ${ctx.update.update_id} took ${Date.now() - before} ms`);
});
```

### Critical Rules for Middleware
1. **Registration Order Matters**: Middleware executes top-to-bottom. If you register `bot.on(":text")` before `bot.command("start")` without calling `await next()`, `/start` will be swallowed by `":text"` because commands are text messages.
2. **Always `await next()`**: Calling `next()` without `await` breaks execution order, causes session data loss (session middleware writes back to storage after `await next()` resolves!), bypasses `bot.catch()` error handlers, and breaks `@grammyjs/runner` backpressure.
3. **`next()` Takes Zero Arguments**: Unlike Express (`next(err)`), `next()` in grammY takes no arguments. To signal an error, simply `throw err`.

---

## 8. Reactions (`ctx.react`, `bot.reaction`, `ctx.reactions`)

### Reacting to Messages from Your Bot
```ts
// React to the current message
bot.command("start", (ctx) => ctx.react("😍"));
bot.on("message", (ctx) => ctx.react(["👍", "🎉"])); // or a single emoji

// React to any message via ctx.api or bot.api
await ctx.api.setMessageReaction(chatId, messageId, [
  { type: "emoji", emoji: "🔥" },
]);
```

### Receiving Reaction Updates
Reaction updates (`message_reaction` and `message_reaction_count`) are only sent by Telegram if:
1. Your bot is an **administrator** in the chat (or it's a private chat with the bot).
2. You explicitly enable them in `allowed_updates` (they are NOT included in `DEFAULT_UPDATE_TYPES`!):

```ts
import { API_CONSTANTS } from "grammy";

bot.start({
  allowed_updates: ["message", "callback_query", "message_reaction", "message_reaction_count"],
  // Or enable every update type supported by Telegram:
  // allowed_updates: API_CONSTANTS.ALL_UPDATE_TYPES,
});
```

### Listening for New Reactions (`bot.reaction`)
```ts
// Standard emoji reactions
bot.reaction("🎉", (ctx) => ctx.reply("Party time!"));
bot.reaction(["👍", "👎"], (ctx) => ctx.reply("Thanks for the vote!"));

// Custom emoji reaction (by custom_emoji_id)
bot.reaction(
  { type: "custom_emoji", custom_emoji_id: "5368324170671202286" },
  (ctx) => ctx.reply("Nice custom emoji!"),
);

// Paid Star reaction (Telegram Stars)
bot.reaction({ type: "paid" }, (ctx) => ctx.reply("Thank you for the Star reaction! ⭐"));
```

### Inspecting Reaction Diffs (`ctx.reactions()`)
```ts
bot.on("message_reaction", async (ctx) => {
  const {
    emoji,              // Emoji currently present on this user's reaction
    emojiAdded,         // Emoji newly added in this update
    emojiKept,          // Emoji unchanged in this update
    emojiRemoved,       // Emoji removed in this update
    customEmoji,        // Custom emoji IDs currently present
    customEmojiAdded,   // Custom emoji IDs newly added
    customEmojiKept,    // Custom emoji IDs unchanged
    customEmojiRemoved, // Custom emoji IDs removed
    paid,               // boolean: Paid reaction currently present
    paidAdded,          // boolean: Paid reaction newly added
  } = ctx.reactions();

  if (emojiRemoved.includes("👍")) {
    await ctx.reply("Why did you remove your thumbs up? 😢");
  }
});

// Anonymous reaction counts in channels & linked discussion forwards
bot.on("message_reaction_count", async (ctx) => {
  const { message_id, reactions } = ctx.messageReactionCount;
  console.log(`Post ${message_id} reaction counts:`, reactions);
});
```

---

## 9. Error Handling (`bot.catch` & `bot.errorBoundary`)

### Global Error Handler (`bot.catch`)
Uncaught errors thrown inside middleware are wrapped in a `BotError<C>` containing `err.ctx` and `err.error`:

```ts
import { BotError, GrammyError, HttpError } from "grammy";

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    // Telegram API returned `{ ok: false, error_code, description, parameters }`
    console.error(`GrammyError [${e.error_code}] (${e.method}): ${e.description}`);
  } else if (e instanceof HttpError) {
    // Network failure (DNS, socket hangup, TLS error)
    console.error("Could not contact Telegram:", e);
  } else {
    // Application bug (DB failure, TypeError, etc.)
    console.error("Unknown error:", e);
  }
});
```

### Scoped Error Boundaries (`bot.errorBoundary`)
Use `bot.errorBoundary(errorHandler, ...middleware)` to isolate errors in a sub-tree of middleware without letting them bubble up to `bot.catch()`. If the boundary's `errorHandler` calls `await next()`, control flow resumes after the boundary!

```ts
async function boundaryHandler(err: BotError, next: NextFunction) {
  console.error("Caught inside boundary:", err.error);
  // Optionally call `await next()` to continue execution outside the boundary
}

const protectedFeature = bot.errorBoundary(boundaryHandler);
protectedFeature.command("risky", async (ctx) => {
  throw new Error("Handled by boundaryHandler!");
});
```

---

## 10. File Handling (`file_id`, Downloading, `InputFile`)

### How Telegram Files Work
- **`file_id`**: Used to resend or download a file. **Specific to your bot** (cannot be shared across different bots). Multiple `file_id`s can point to the same underlying file.
- **`file_unique_id`**: Consistent across all bots for the same file, used to deduplicate files. Cannot be used to download or send files.
- **Size Limits (Standard Bot API)**:Bots can download files up to **20 MB** and upload files up to **50 MB** (or **2,000 MB** upload / unlimited download with a [Local Bot API Server](#4-the-bot-api-botapi-vs-ctxapi-raw-calls--local-bot-api-server)).

### Receiving & Downloading Files
```ts
// ":file" matches photo, animation, audio, document, video, video_note, voice, sticker
bot.on(":file", async (ctx) => {
  const file = await ctx.getFile(); // calls getFile on the update's media
  const fileId = file.file_id;
  const filePath = file.file_path;  // valid for at least 1 hour

  // Manual download URL:
  const downloadUrl = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
  console.log("Download from:", downloadUrl);
});
```
> **Tip**: Use the official [`@grammyjs/files`](./plugins-guide.md#12-files-plugin-grammyjsfiles) plugin to call `const localPath = await file.download()` or `file.getUrl()` directly!

### Sending Files (`InputFile` vs. `file_id` / URL)
1. **Resending by `file_id` or Public HTTP URL**: Pass the string directly (fast, zero upload bandwidth):
   ```ts
   await ctx.replyWithPhoto("AgACAgIAAxkBAAIB...");
   await ctx.replyWithPhoto("https://grammy.dev/images/Y.png", { caption: "Logo" });
   ```
2. **Uploading Binary Data via `InputFile`**:
   `InputFile` supports local disk paths, `Uint8Array` / `Buffer`, Node.js `fs.ReadStream`, Web `ReadableStream`, `AsyncIterable<Uint8Array>`, `URL` objects, or lazy factory functions `() => ...`:
   ```ts
   import { InputFile } from "grammy";
   import fs from "node:fs";

   // From local disk path
   await ctx.replyWithDocument(new InputFile("/path/to/report.pdf"));

   // From Buffer / Uint8Array with custom filename
   const bytes = new TextEncoder().encode("Hello world");
   await ctx.replyWithDocument(new InputFile(bytes, "hello.txt"));

   // From ReadStream
   await ctx.replyWithPhoto(new InputFile(fs.createReadStream("./photo.jpg")));

   // Force Telegram to download a URL on your server first if Telegram's URL fetch fails:
   await ctx.replyWithPhoto(new InputFile({ url: "https://example.com/image.png" }));
   ```

---

## 11. HTML5 Games (`guide/games.md`)

Telegram bots can host HTML5 games created with `@BotFather` (`/newgame`).

1. **Sending a Game**:
   ```ts
   bot.command("game", async (ctx) => {
     // Pass the short_name configured in @BotFather
     await ctx.replyWithGame("my_awesome_game");
   });
   ```
2. **Launching the Game URL on Button Press**:
   When a user clicks the "Play" button on a game message, your bot receives a `callback_query:game_short_name` update. Answer it with the HTTPS URL of your HTML5 game (optionally including user/message identifiers in the query string):
   ```ts
   bot.on("callback_query:game_short_name", async (ctx) => {
     const userId = ctx.from.id;
     await ctx.answerCallbackQuery({
       url: `https://my-game.example.com/play?user=${userId}`,
     });
   });
   ```
3. **Updating High Scores & Sharing**:
   - Inside your HTML5 game page, include `<script src="https://telegram.org/js/games.js"></script>` and call `TelegramGameProxy.shareScore()` to let users share their score.
   - From your backend/bot, call `await bot.api.setGameScore(chatId, messageId, userId, score)` (or pass `inline_message_id` for games launched via Inline Mode).
