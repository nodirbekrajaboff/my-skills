# Advanced Patterns, Proxies, Games & Architecture

This reference covers advanced features and ecosystem details: HTML5 Telegram Games, Proxy configurations, Advanced Middleware composition, Deep-dive Bot API Transformers, Framework comparisons, and FAQs.

---

## 1. Telegram HTML5 Games (`guide/games`)

Telegram allows bots to serve interactive HTML5 games with high score leaderboards.

### 1.1 Creating & Sending Games
1. Create a game via [@BotFather](https://t.me/BotFather) using `/newgame` and note its `game_short_name`.
2. Host your HTML5 game on an HTTPS web server.
3. Send the game using `ctx.replyWithGame` or `ctx.api.sendGame`:

```typescript
import { InlineKeyboard } from "grammy";

// Create game button (the first button in reply_markup MUST be a game button)
const gameKeyboard = new InlineKeyboard().game("🎮 Play Space Invaders");

bot.command("game", async (ctx) => {
  await ctx.replyWithGame("space_invaders", {
    reply_markup: gameKeyboard,
  });
});
```

### 1.2 Listening to Game Play Button Presses
When a user taps the game button, Telegram emits a `callback_query:game_short_name` update. Your bot must answer with the hosted game URL:

```typescript
bot.on("callback_query:game_short_name", async (ctx) => {
  // Pass the public HTTPS game URL
  await ctx.answerCallbackQuery({
    url: `https://my-game.com?userId=${ctx.from.id}`,
  });
});
```

### 1.3 Managing High Scores
```typescript
// Set user score
await ctx.api.setGameScore(userId, 4200, {
  chat_id: ctx.chat?.id,
  message_id: ctx.msg?.message_id,
});

// Retrieve high scores leaderboard
const highScores = await ctx.api.getGameHighScores(userId, {
  chat_id: ctx.chat?.id,
  message_id: ctx.msg?.message_id,
});
```

---

## 2. Proxy Support (`advanced/proxy`)

When deploying bots in restricted network environments or behind corporate firewalls, route all outgoing Bot API requests through a proxy.

### 2.1 Node.js Proxy Configuration
Use `https-proxy-agent` or `socks-proxy-agent`:

```bash
npm install https-proxy-agent
# or for SOCKS5: npm install socks-proxy-agent
```

```typescript
import { Bot } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";

const agent = new HttpsProxyAgent("http://proxy-server.example.com:8080");

export const bot = new Bot(process.env.BOT_TOKEN!, {
  client: {
    baseFetchConfig: {
      agent,
      compress: true,
    },
  },
});
```

### 2.2 Bun Proxy Configuration
Bun natively respects environment variables out of the box:
```bash
HTTP_PROXY="http://proxy-server.example.com:8080"
HTTPS_PROXY="http://proxy-server.example.com:8080"
```
No manual code changes needed in Bun!

### 2.3 Local Telegram Bot API Server
If self-hosting a local Bot API instance (for uploading files up to 2GB and eliminating Telegram network roundtrips):

```typescript
export const bot = new Bot(process.env.BOT_TOKEN!, {
  client: {
    apiRoot: "http://localhost:8081",
  },
});
```

---

## 3. Advanced Middleware Redux & Branching (`advanced/middleware`)

### 3.1 Conditional Branching (`composer.branch`)
Run different middleware stacks based on a predicate condition:

```typescript
import { Composer } from "grammy";

const adminComposer = new Composer<MyContext>();
const userComposer = new Composer<MyContext>();

// Branch: if predicate returns true -> adminComposer, else -> userComposer
bot.use(
  Composer.branch(
    (ctx) => ctx.from?.id === 123456789, // Check if Admin
    adminComposer,
    userComposer
  )
);
```

### 3.2 Filtering Updates (`composer.filter`)
Execute middleware only if a synchronous or asynchronous predicate matches:

```typescript
// Only handle messages sent during business hours
bot.filter(
  (ctx) => {
    const hour = new Date().getUTCHours();
    return hour >= 9 && hour <= 17;
  },
  async (ctx) => {
    await ctx.reply("Welcome during business hours!");
  }
);
```

---

## 4. Deep-Dive Bot API Transformers (`advanced/transformers`)

Transformers intercept every single call to Telegram's HTTP API before it is dispatched.

### Transformer Signature
```typescript
type Transformer = (
  prev: (method: string, payload: any, signal?: AbortSignal) => Promise<any>,
  method: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<any>;
```

### Example: Custom Performance Auditing Transformer
```typescript
bot.api.config.use(async (prev, method, payload, signal) => {
  const start = performance.now();
  try {
    const result = await prev(method, payload, signal);
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[Telegram API] ${method} took ${duration}ms`);
    return result;
  } catch (error) {
    console.error(`[Telegram API Error] Method ${method} failed:`, error);
    throw error;
  }
});
```

---

## 5. Comparison: grammY vs. Other Frameworks (`resources/comparison`)

| Feature | grammY | Telegraf (v4) | node-telegram-bot-api |
| :--- | :--- | :--- | :--- |
| **Language & Types** | **TypeScript-first** (Strict compile-time type inference) | Partial TS rewrite | Loose types, outdated |
| **Runtime Support** | **Universal** (Bun, Node, Deno, Cloudflare, Edge) | Node.js primarily | Node.js only |
| **Onion Middleware** | Yes (Pure Koa-style, upstream & downstream) | Yes | No (EventEmitter-based) |
| **Concurrency & Runner**| `@grammyjs/runner` + `sequentialize` (No WAR hazards)| Sequential only | No concurrency control |
| **Flood Wait (429)** | Official `@grammyjs/auto-retry` | Manual backoff code | Manual backoff code |
| **Dialog Flows** | `@grammyjs/conversations` (linear async/await) | Scene system (complex states)| None |
| **Bot API 7+ / 8+** | Day-1 support (Stars, Business, Reactions, Effects)| Slow to update | Abandoned/slow |

---

## 6. Frequently Asked Questions & Gotchas (`resources/faq`)

### Q: Why do my message reactions or business messages not arrive?
**A**: When running `bot.start()` or `bot.api.setWebhook()`, Telegram only delivers `message` updates by default. You **must** specify `allowed_updates`:
```typescript
bot.start({
  allowed_updates: [
    "message",
    "edited_message",
    "callback_query",
    "message_reaction",
    "message_reaction_count",
    "business_connection",
    "business_message",
  ],
});
```

### Q: Can I run multiple bots in the same process?
**A**: Yes! grammY has **zero global state**. You can instantiate as many `new Bot()` instances as you like in a single process without conflict.

### Q: How do I test my bot in CI/CD?
**A**: Use grammY's transformer system or mock Telegram updates using test payloads. Since `bot.handleUpdate(rawUpdate)` accepts plain JavaScript objects, you can feed synthetic updates directly into your bot pipeline without hitting Telegram servers!
