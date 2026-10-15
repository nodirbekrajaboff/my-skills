import { Bot, Context, session, type SessionFlavor } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { autoRetry } from "@grammyjs/auto-retry";
import { limit } from "@grammyjs/ratelimiter";

interface SessionData {
  interactions: number;
}

export type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required!");

export const bot = new Bot<MyContext>(token);

// 1. Install Outbound API Transformer for Auto-Retry (handles 429 Flood Waits)
bot.api.config.use(
  autoRetry({
    maxRetryAttempts: 3,
    maxDelaySeconds: 60,
  })
);

// 2. Concurrency Session Key Helper
function getSessionKey(ctx: Context): string | undefined {
  return ctx.chat?.id.toString();
}

// 3. Sequentialize by session key BEFORE session middleware
// CRITICAL: Avoids Write-After-Read (WAR) session corruption under high concurrency
bot.use(sequentialize(getSessionKey));

// 4. Install Inbound Rate Limiting (Spam protection)
bot.use(
  limit({
    timeFrame: 1000, // 1 second
    limit: 2,        // Max 2 updates per second per user
    keyGenerator: (ctx) => ctx.from?.id.toString(),
    onLimitExceeded: async (ctx) => {
      await ctx.reply("⚠️ Slow down! Please wait a moment before sending more messages.");
    },
  })
);

// 5. Session Middleware
bot.use(
  session({
    getSessionKey,
    initial: (): SessionData => ({
      interactions: 0,
    }),
  })
);

// 6. Handlers
bot.command("start", async (ctx) => {
  ctx.session.interactions++;
  await ctx.reply(`👋 Welcome! Total bot interactions: ${ctx.session.interactions}`);
});

bot.on("message:text", async (ctx) => {
  ctx.session.interactions++;
  await ctx.reply(`Echo (${ctx.session.interactions}): ${ctx.msg.text}`);
});

// 7. Start Concurrent Runner
const runner = run(bot, {
  runner: {
    fetch: {
      allowed_updates: ["message", "callback_query", "message_reaction"],
    },
  },
  sink: {
    concurrency: 500, // Process up to 500 updates concurrently
  },
});

console.log("⚡ High-concurrency bot runner started!");

// 8. Graceful Shutdown
const stopRunner = () => {
  if (runner.isRunning()) {
    console.log("Stopping runner...");
    runner.stop();
  }
};

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
