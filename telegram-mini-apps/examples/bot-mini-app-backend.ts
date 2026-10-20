/**
 * Complete Bot + Backend HTTP Integration for Telegram Mini Apps
 * Demonstrates:
 * 1. Launching Mini App via InlineKeyboard, Reply Keyboard, and MenuButtonWebApp
 * 2. Handling `message:web_app_data` from Reply Keyboard `sendData()`
 * 3. Answering `query_id` via `answerWebAppQuery`
 * 4. Creating a Telegram Stars (`XTR`) invoice link for `Telegram.WebApp.openInvoice()`
 * 5. Preparing a shareable message via `savePreparedInlineMessage` for `Telegram.WebApp.shareMessage()`
 */

import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { validateInitDataHmac } from "./verify-init-data-hmac";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const MINI_APP_URL = process.env.MINI_APP_URL || "https://example.com/app";

export const bot = new Bot(BOT_TOKEN);

// 1. Command to configure Menu Button and show Inline & Reply Keyboard launch buttons
bot.command("start", async (ctx) => {
  // Configure persistent Menu Button for this user
  await ctx.setChatMenuButton({
    type: "web_app",
    text: "Open Mini App",
    web_app: { url: MINI_APP_URL },
  });

  // Inline Keyboard launch (provides `user` and `query_id` in initData)
  const inlineKeyboard = new InlineKeyboard().webApp("Launch Dashboard", MINI_APP_URL);

  await ctx.reply("Tap below to open the Mini App:", {
    reply_markup: inlineKeyboard,
  });
});

// Optional Reply Keyboard launch (uses `Telegram.WebApp.sendData(str)`)
bot.command("quickform", async (ctx) => {
  const replyKeyboard = new Keyboard()
    .webApp("Fill Quick Form", `${MINI_APP_URL}/quick-form`)
    .resized()
    .oneTime();

  await ctx.reply("Use the keyboard button below to submit form data:", {
    reply_markup: replyKeyboard,
  });
});

// 2. Handle service messages returned by `Telegram.WebApp.sendData(payload)`
bot.on("message:web_app_data", async (ctx) => {
  const { button_text, data } = ctx.msg.web_app_data;
  const parsed = JSON.parse(data);
  await ctx.reply(`Received data from "${button_text}":\n<pre>${JSON.stringify(parsed, null, 2)}</pre>`, {
    parse_mode: "HTML",
  });
});

// 3. Handle Telegram Stars (`XTR`) pre-checkout and successful payment updates
bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.msg.successful_payment;
  console.log("Stars payment completed:", payment.telegram_payment_charge_id, payment.invoice_payload);
});

/**
 * Example Backend HTTP Route Handlers (compatible with Bun.serve / Hono / Fetch API)
 */
export async function handleMiniAppApiRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("tma ")) {
    return Response.json({ error: "Missing 'Authorization: tma <initData>' header" }, { status: 401 });
  }

  let verified;
  try {
    verified = validateInitDataHmac(authHeader.slice(4), BOT_TOKEN, 3600);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 401 });
  }

  const url = new URL(req.url);

  // Route A: Complete action and post message into chat via `answerWebAppQuery`
  if (req.method === "POST" && url.pathname === "/api/submit-order") {
    if (!verified.queryId) {
      return Response.json({ error: "query_id not available in this launch mode" }, { status: 400 });
    }
    const body = (await req.json()) as { itemTitle: string };

    await bot.api.answerWebAppQuery(verified.queryId, {
      type: "article",
      id: `order_${Date.now()}`,
      title: "Order Confirmed",
      input_message_content: {
        message_text: `✅ Ordered: <b>${body.itemTitle}</b>`,
        parse_mode: "HTML",
      },
    });

    return Response.json({ ok: true });
  }

  // Route B: Create a Telegram Stars (`XTR`) invoice link for `Telegram.WebApp.openInvoice(url)`
  if (req.method === "POST" && url.pathname === "/api/create-stars-invoice") {
    const body = (await req.json()) as { title: string; starsAmount: number; payloadId: string };

    const invoiceUrl = await bot.api.createInvoiceLink(
      body.title,
      `Purchase ${body.title}`,
      body.payloadId,
      "", // Empty provider_token for Telegram Stars!
      "XTR",
      [{ label: body.title, amount: body.starsAmount }]
    );

    return Response.json({ invoiceUrl });
  }

  // Route C: Prepare an inline message for `Telegram.WebApp.shareMessage(preparedId)` (Bot API 8.0+)
  if (req.method === "POST" && url.pathname === "/api/prepare-share-message") {
    if (!verified.user) {
      return Response.json({ error: "User context required" }, { status: 400 });
    }

    const prepared = await bot.api.savePreparedInlineMessage(
      verified.user.id,
      {
        type: "article",
        id: `share_${Date.now()}`,
        title: "Join my squad!",
        input_message_content: {
          message_text: `🔥 Join ${verified.user.first_name}'s squad inside our Mini App!`,
        },
        reply_markup: new InlineKeyboard().url(
          "Join Squad",
          `https://t.me/${bot.botInfo.username}/app?startapp=squad_${verified.user.id}`
        ),
      },
      {
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: false,
      }
    );

    return Response.json({ preparedMessageId: prepared.id, expiresAt: prepared.expiration_date });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
