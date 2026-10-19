# Modern Telegram Bot API Features in grammY (Bot API 7.x – 10.x)

## Table of Contents

1. [Telegram Stars (`XTR`: Digital Goods, Subscriptions & Refunds)](#1-telegram-stars-xtr-digital-goods-subscriptions--refunds)
2. [Paid Media & Paid Broadcasts](#2-paid-media--paid-broadcasts)
3. [Telegram Business Integration](#3-telegram-business-integration)
4. [Message Reactions (Emoji, Custom Emoji & Paid Star Reactions)](#4-message-reactions-emoji-custom-emoji--paid-star-reactions)
5. [Message Effects, Quotes, Link Previews & Spoilers](#5-message-effects-quotes-link-previews--spoilers)
6. [Telegram Mini Apps (Web Apps) & `initData` Verification](#6-telegram-mini-apps-web-apps--initdata-verification)
7. [Forum Topics & Supergroup Threads](#7-forum-topics--supergroup-threads)

---

## 1. Telegram Stars (`XTR`: Digital Goods, Subscriptions & Refunds)

Telegram Stars (`currency: "XTR"`, `provider_token: ""`) allow bots to sell digital goods, services, and recurring subscriptions natively inside Telegram.

### 1.1 Creating an Invoice Link (`createInvoiceLink`)
`ctx.api.createInvoiceLink` takes `(title, description, payload, provider_token, currency, prices, other?)`:

```ts
import { InlineKeyboard } from "grammy";

bot.command("buy_vip", async (ctx) => {
  const invoiceLink = await ctx.api.createInvoiceLink(
    "Premium VIP Pass",
    "Unlock 30 days of VIP access",
    `sub_vip_${ctx.from?.id}_${Date.now()}`,
    "",    // provider_token must be "" for Telegram Stars (XTR)
    "XTR", // Telegram Stars currency code
    [{ label: "VIP Pass", amount: 150 }], // 150 Stars
  );

  const keyboard = new InlineKeyboard().url("⭐ Pay 150 Stars", invoiceLink);
  await ctx.reply("Click below to complete payment with Telegram Stars:", {
    reply_markup: keyboard,
  });
});
```

### 1.2 Sending an Invoice Message Directly (`replyWithInvoice`)
`ctx.replyWithInvoice` takes `(title, description, payload, currency, prices, other?)` (in recent grammY versions `provider_token` is optional in `other` and defaults to `""` for Stars):

```ts
bot.command("invoice", async (ctx) => {
  await ctx.replyWithInvoice(
    "Exclusive Sticker Pack",
    "Unlock our community sticker collection",
    "pack_stars_01",
    "XTR",
    [{ label: "Sticker Pack", amount: 50 }],
  );
});
```

### 1.3 Handling `pre_checkout_query` & `:successful_payment`
Telegram requires your bot to answer `pre_checkout_query` within **10 seconds**:

```ts
// 1. Validate and approve pre-checkout query within 10s
bot.on("pre_checkout_query", async (ctx) => {
  const payload = ctx.preCheckoutQuery.invoice_payload;
  const inStock = true; // Verify inventory / user eligibility

  if (inStock) {
    await ctx.answerPreCheckoutQuery(true);
  } else {
    await ctx.answerPreCheckoutQuery(false, {
      error_message: "Sorry, this item is currently unavailable.",
    });
  }
});

// 2. Provision digital goods on successful payment
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  console.log(
    `Paid ${payment.total_amount} ${payment.currency}, charge_id: ${payment.telegram_payment_charge_id}`,
  );
  // Save payment.telegram_payment_charge_id in DB (needed for refunds!)
  await ctx.reply("🎉 Payment received! Your VIP access is now active.");
});
```

### 1.4 Refunding Star Payments & Star Subscriptions
```ts
// Refund a Telegram Stars payment using the stored telegram_payment_charge_id:
await ctx.api.refundStarPayment(userId, telegramPaymentChargeId);

// Query the bot's Star transactions:
const transactions = await bot.api.getStarTransactions({ limit: 50 });

// Create a paid Star subscription invite link for a channel (monthly = 2592000s):
const subLink = await ctx.api.createChatInviteLink(channelId, {
  name: "Monthly VIP Channel",
  subscription_period: 2592000,
  subscription_price: 200, // 200 Stars/month
});
```

---

## 2. Paid Media & Paid Broadcasts

### 2.1 Sending Paid Media (`sendPaidMedia`)
Send blurred photos/videos that users can unlock with Telegram Stars:

```ts
import { InputFile } from "grammy";

bot.command("exclusive", async (ctx) => {
  await ctx.api.sendPaidMedia(
    ctx.chat.id,
    25, // 25 Stars to unlock
    [
      {
        type: "photo",
        media: new InputFile("./assets/exclusive_art.png"),
      },
    ],
    {
      caption: "Unlock this artwork for 25 Stars!",
      payload: "art_01",
    },
  );
});

// Listen for purchased paid media updates (enable "purchased_paid_media" in allowed_updates):
bot.on("purchased_paid_media", async (ctx) => {
  console.log(`User ${ctx.from.id} unlocked paid media: ${ctx.purchasedPaidMedia.paid_media_payload}`);
});
```

### 2.2 Paid Broadcasts (`allow_paid_broadcast`)
Raise your bot's broadcast limit up to **1,000 messages/second** (costs 0.1 Stars per message over 30 msg/s):

```ts
await bot.api.sendMessage(chatId, "Flash announcement!", {
  allow_paid_broadcast: true,
});
```

---

## 3. Telegram Business Integration

See [Advanced Patterns: Telegram Business Bots](./advanced-patterns.md#3-telegram-business-bots-advancedbusinessmd) for complete details.

```ts
// Connection lifecycle
bot.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  if (conn.is_enabled && conn.rights?.can_reply) {
    await bot.api.sendMessage(conn.user_chat_id, "Business bot connected!");
  }
});

// Customer vs. Business Owner messages
bot.on("business_message:text", async (ctx) => {
  const conn = await ctx.getBusinessConnection();
  if (ctx.from.id === conn.user.id) return; // Ignore messages sent by the business owner

  // ctx.reply automatically attaches ctx.businessConnectionId!
  await ctx.reply("Thanks for reaching out! We will reply shortly.");
});
```

---

## 4. Message Reactions (Emoji, Custom Emoji & Paid Star Reactions)

See [Core & Context: Reactions](./core-and-context.md#8-reactions-ctxreact-botreaction-ctxreactions) for full details.

```ts
// React to the current message
bot.command("like", (ctx) => ctx.react("👍"));

// Listen for newly added emoji, custom_emoji, or paid Star reactions
bot.reaction(["🔥", "🎉"], (ctx) => ctx.reply("Thanks for the reaction!"));
bot.reaction({ type: "paid" }, (ctx) => ctx.reply("Thanks for the Star reaction! ⭐"));

// Inspect added/removed reactions via ctx.reactions()
bot.on("message_reaction", async (ctx) => {
  const { emojiAdded, emojiRemoved, paidAdded } = ctx.reactions();
  if (paidAdded) await ctx.reply("Star reaction added!");
});
```

---

## 5. Message Effects, Quotes, Link Previews & Spoilers

```ts
const EFFECTS = {
  FIRE: "5104841245755180586",
  THUMBS_UP: "5107584321108051014",
  HEARTS: "5159385139981059251",
  CONFETTI: "5046509860389126442",
};

bot.on("message:text", async (ctx) => {
  await ctx.reply("🎉 Level up!", {
    // Animated message effect:
    message_effect_id: EFFECTS.CONFETTI,
    // Quote a specific substring of the user's message:
    reply_parameters: {
      message_id: ctx.msg.message_id,
      quote: ctx.msg.text.slice(0, 30),
      allow_sending_without_reply: true,
    },
    // Customize link preview appearance:
    link_preview_options: {
      url: "https://grammy.dev",
      prefer_large_media: true,
      show_above_text: true,
    },
  });
});

// Send media with a blur spoiler overlay:
await ctx.replyWithPhoto("https://grammy.dev/images/Y.png", {
  has_spoiler: true,
});
```

---

## 6. Telegram Mini Apps (Web Apps) & `initData` Verification

### 6.1 Launching Mini Apps (`InlineKeyboard.webApp` vs `Keyboard.webApp`)
- **`InlineKeyboard().webApp(text, url)`**: Opens the Mini App with full context; can call `answerWebAppQuery` from your backend.
- **`Keyboard().webApp(text, url)`**: Opens the Mini App from a custom reply keyboard; when the Mini App calls `Telegram.WebApp.sendData(str)`, your bot receives a `message:web_app_data` update:

```ts
import { InlineKeyboard, Keyboard } from "grammy";

bot.command("webapp", async (ctx) => {
  const inlineKb = new InlineKeyboard().webApp(
    "🚀 Open Mini App",
    "https://my-mini-app.example.com",
  );
  await ctx.reply("Launch our Mini App:", { reply_markup: inlineKb });
});

// Handle data sent back from Keyboard().webApp via Telegram.WebApp.sendData():
bot.on("message:web_app_data", async (ctx) => {
  const { button_text, data } = ctx.message.web_app_data;
  await ctx.reply(`Received data from "${button_text}": ${data}`);
});
```

### 6.2 Cryptographic Verification of `window.Telegram.WebApp.initData`
Always validate `initData` on your backend before trusting the user identity in a Mini App:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  if (!hash) return false;

  urlParams.delete("hash");

  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(calculatedHash, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

---

## 7. Forum Topics & Supergroup Threads

In supergroups with Forum Topics enabled (`ctx.chat.is_forum === true`):

```ts
// Create a new Forum Topic:
bot.command("newtopic", async (ctx) => {
  const topic = await ctx.createForumTopic("Support Thread 🛠");
  await ctx.api.sendMessage(ctx.chat.id, "Thread initialized!", {
    message_thread_id: topic.message_thread_id,
  });
});

// Reply inside the same Forum Topic thread:
bot.on("message:is_topic_message", async (ctx) => {
  const threadId = ctx.msg.message_thread_id;
  // Note: ctx.reply() automatically targets ctx.msg.message_thread_id in grammY!
  await ctx.reply(`Replying inside topic #${threadId}`);
});
```
