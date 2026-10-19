import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InlineQueryResultBuilder,
} from "grammy";

export type MyContext = Context;

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN environment variable is missing!");
}

export const bot = new Bot<MyContext>(token);

// In-memory data store for demonstration
const ARTICLES = [
  {
    id: "1",
    title: "grammY Framework Guide",
    description: "The modern Telegram Bot framework for TypeScript & JavaScript.",
    url: "https://grammy.dev",
    content: "<b>grammY</b> is the modern Telegram bot framework for Bun, Node.js, and Deno.",
  },
  {
    id: "2",
    title: "Plugins Ecosystem",
    description: "Explore conversations, interactive menus, runner, and more.",
    url: "https://grammy.dev/plugins/",
    content: "Browse all official and built-in plugins at <i>grammy.dev/plugins</i>.",
  },
  {
    id: "3",
    title: "Bot API 8.0 Features",
    description: "Paid broadcasts, Telegram Stars, reactions, and mini apps.",
    url: "https://core.telegram.org/bots/api",
    content: "Discover the latest Bot API features including Telegram Stars and Business bots.",
  },
];

// 1. Specific Query Handler with Regex Matching
bot.inlineQuery(/^search\s*(.*)$/i, async (ctx) => {
  const query = ctx.match[1].trim().toLowerCase();
  
  const filtered = ARTICLES.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
  );

  const results = filtered.map((item) =>
    InlineQueryResultBuilder.article(`article:${item.id}`, item.title, {
      description: item.description,
      reply_markup: new InlineKeyboard().url("Read Online 📖", item.url),
    }).text(item.content, { parse_mode: "HTML" })
  );

  await ctx.answerInlineQuery(results, {
    cache_time: 300, // 5 minutes cache
    is_personal: false,
    button: {
      text: "Explore Bot Features",
      start_parameter: "inline_explore",
    },
  });
});

// 2. Generic Query Handler with Pagination (Offset)
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query.trim().toLowerCase();
  const offset = parseInt(ctx.inlineQuery.offset || "0", 10);
  const pageSize = 2;

  const matched = ARTICLES.filter(
    (item) =>
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
  );

  const paginated = matched.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize < matched.length ? (offset + pageSize).toString() : "";

  const results = paginated.map((item) =>
    InlineQueryResultBuilder.article(`page:${item.id}`, item.title, {
      description: item.description,
      reply_markup: new InlineKeyboard().url("Open Link 🔗", item.url),
    }).text(item.content, { parse_mode: "HTML" })
  );

  await ctx.answerInlineQuery(results, {
    cache_time: 60,
    next_offset: nextOffset,
    button: {
      text: "Open Bot Help",
      start_parameter: "help",
    },
  });
});

// 3. Track Selected Results (requires /setinlinefeedback in BotFather)
bot.chosenInlineResult(/^(article|page):(\d+)$/, async (ctx) => {
  const resultId = ctx.chosenInlineResult.result_id;
  const query = ctx.chosenInlineResult.query;
  console.log(`[Inline Audit] User ${ctx.from.id} chose "${resultId}" for search "${query}"`);
});

// 4. Handle Users redirected from Inline Query Switch-to-PM Button
bot.command("start", async (ctx) => {
  const payload = ctx.match;
  if (payload === "inline_explore") {
    await ctx.reply("👋 Welcome! You discovered us via Inline Mode.", {
      reply_markup: new InlineKeyboard().switchInline("Try Inline Search", "search grammy"),
    });
    return;
  }

  await ctx.reply("👋 Hello! Try using this bot in any chat by typing: <code>@your_bot search</code>", {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().switchInline("Search now", "search "),
  });
});

// 5. Global Error Handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`, err.error);
  if (err.error instanceof GrammyError) {
    console.error("Grammy API error:", err.error.description);
  } else if (err.error instanceof HttpError) {
    console.error("Network HTTP error:", err.error);
  }
});

// Run bot in development
if (process.env.NODE_ENV !== "test") {
  bot.start({
    onStart: (info) => console.log(`Inline Bot @${info.username} is running!`),
  });
}
