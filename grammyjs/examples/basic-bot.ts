import { Bot, Context, GrammyError, HttpError, InlineKeyboard } from "grammy";

// 1. Define custom context if extending ctx
export type MyContext = Context;

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN environment variable is missing!");
}

export const bot = new Bot<MyContext>(token);

// 2. Global Logging Middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`Update ${ctx.update.update_id} took ${ms}ms`);
});

// 3. Command Handlers
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Help ℹ️", "btn:help")
    .url("Official Docs 📖", "https://grammy.dev");

  await ctx.reply(`👋 Hello ${ctx.from?.first_name || "there"}! Welcome to the bot.`, {
    reply_markup: keyboard,
  });
});

bot.command("ping", async (ctx) => {
  await ctx.reply("🏓 Pong!");
});

// 4. Callback Query Handlers
bot.callbackQuery("btn:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Available commands:\n/start - Restart\n/ping - Health check");
});

// 5. Message Filters & Reactions
bot.on("message:text", async (ctx) => {
  // Echo with a thumbs up reaction
  await ctx.react("👍");
  await ctx.reply(`You said: ${ctx.msg.text}`);
});

// 6. Global Error Handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// 7. Start Polling
bot.start({
  onStart: (info) => {
    console.log(`🚀 Bot @${info.username} is running!`);
  },
});
