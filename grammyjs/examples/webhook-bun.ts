import { Bot, webhookCallback } from "grammy";

const token = process.env.BOT_TOKEN;
const webhookSecret = process.env.WEBHOOK_SECRET;

if (!token) throw new Error("BOT_TOKEN is required!");
if (!webhookSecret) throw new Error("WEBHOOK_SECRET is required!");

export const bot = new Bot(token);

bot.command("start", (ctx) => {
  ctx.reply("⚡ Fast and lightweight Telegram bot powered by Bun & grammY!");
});

bot.command("info", (ctx) => {
  ctx.reply(`Runtime: Bun ${Bun.version}\nPlatform: ${process.platform}`);
});

bot.on("message:text", (ctx) => {
  ctx.reply(`Received: ${ctx.msg.text}`);
});

// Configure webhook handler with secret token authentication
const handleWebhook = webhookCallback(bot, "bun", {
  secretToken: webhookSecret,
  onTimeout: () => {
    console.warn("⚠️ Webhook processing timed out (>10s)");
  },
});

const PORT = Number(process.env.PORT) || 3000;

export default {
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check endpoint for uptime monitors
    if (url.pathname === "/healthz" && req.method === "GET") {
      return new Response("OK", { status: 200 });
    }

    // Telegram webhook endpoint
    if (url.pathname === "/webhook" && req.method === "POST") {
      try {
        return await handleWebhook(req);
      } catch (err) {
        console.error("Webhook processing error:", err);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

console.log(`🚀 Webhook server running at http://localhost:${PORT}/webhook`);
