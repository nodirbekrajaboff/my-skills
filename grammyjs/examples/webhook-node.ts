import express from "express";
import { Bot, webhookCallback } from "grammy";

const token = process.env.BOT_TOKEN;
const webhookSecret = process.env.WEBHOOK_SECRET;

if (!token) throw new Error("BOT_TOKEN is required!");
if (!webhookSecret) throw new Error("WEBHOOK_SECRET is required!");

export const bot = new Bot(token);

bot.command("start", (ctx) => {
  return ctx.reply("👋 Hello from Node.js Express Webhook server!");
});

bot.on("message:text", (ctx) => {
  return ctx.reply(`Echo: ${ctx.msg.text}`);
});

const app = express();

// Health check endpoint
app.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});

// Parse incoming JSON bodies (required by grammY's "express" webhookCallback adapter)
app.use(express.json());

// Mount webhook handler on a secret path with secretToken verification
app.use(
  "/webhook",
  webhookCallback(bot, "express", {
    secretToken: webhookSecret,
    timeoutMilliseconds: 10_000,
    onTimeout: "return",
  }),
);

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Node.js webhook server running on port ${PORT}`);
});

// Graceful shutdown handling
const shutdown = () => {
  console.log("Shutting down webhook server...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
