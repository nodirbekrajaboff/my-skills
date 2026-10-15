# Telegram Bot API 7.x & 8.x Modern Features

This reference covers modern Telegram Bot API capabilities in grammY: Telegram Stars (digital goods & paid media), Telegram Business connections, message reactions, Mini Apps (Web Apps), message effects, and forum topics.

---

## 1. Telegram Stars (Digital Goods & Payments)

Telegram Stars (`XTR`) allow bots to sell digital goods and services inside Telegram without third-party payment gateways.

### 1.1 Creating an Invoice Link
```typescript
bot.command("buy_item", async (ctx) => {
  const invoiceLink = await ctx.api.createInvoiceLink({
    title: "Premium VIP Subscription",
    description: "Unlock 30 days of VIP analytical access",
    payload: `sub_vip_${ctx.from?.id}_${Date.now()}`,
    currency: "XTR", // Telegram Stars currency code
    prices: [{ label: "VIP Pass", amount: 150 }], // 150 Stars
  });

  const keyboard = new InlineKeyboard().url("⭐️ Pay 150 Stars", invoiceLink);
  await ctx.reply("Click below to complete payment with Stars:", {
    reply_markup: keyboard,
  });
});
```

### 1.2 Direct Invoice Message
```typescript
await ctx.replyWithInvoice({
  title: "Special Sticker Pack",
  description: "Exclusive pack crafted for our community",
  payload: "pack_stars_01",
  currency: "XTR",
  prices: [{ label: "Sticker Pack", amount: 50 }],
});
```

### 1.3 Pre-Checkout & Payment Confirmation
Telegram requires bots to validate pre-checkout queries within 10 seconds.

```typescript
// 1. Approve pre-checkout query
bot.on("pre_checkout_query", async (ctx) => {
  const query = ctx.preCheckoutQuery;
  console.log(`Pre-checkout from ${ctx.from.id}, payload: ${query.invoice_payload}`);

  // Validate inventory or database status
  const itemInStock = true;

  if (itemInStock) {
    await ctx.answerPreCheckoutQuery(true);
  } else {
    await ctx.answerPreCheckoutQuery(false, {
      error_message: "Sorry, this item is temporarily out of stock.",
    });
  }
});

// 2. Handle successful payment
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.msg.successful_payment;
  console.log(`Payment successful! Charge ID: ${payment.telegram_payment_charge_id}`);
  console.log(`Amount: ${payment.total_amount} ${payment.currency}`);

  // Provision user permissions in database
  await ctx.reply("🎉 Payment received! Your VIP features are now activated.");
});
```

### 1.4 Refunding Stars
```typescript
await ctx.api.refundStarPayment(userId, telegramPaymentChargeId);
```

---

## 2. Paid Media & Paid Broadcasts

### 2.1 Sending Paid Media (Locked behind Stars)
Allows sending photos and videos that users can preview in blurred form and unlock with Stars.

```typescript
import { InputFile } from "grammy";

bot.command("exclusive", async (ctx) => {
  await ctx.api.sendPaidMedia(ctx.chat.id, 25, [ // 25 Stars required
    {
      type: "photo",
      media: new InputFile("./assets/exclusive_art.png"),
    },
  ], {
    caption: "Unlock exclusive digital artwork for 25 Stars!",
  });
});
```

### 2.2 Paid Broadcasts
If your bot holds a balance of at least 10,000 Telegram Stars, you can send up to 1,000 messages/sec by passing `allow_paid_broadcast`:

```typescript
await ctx.api.sendMessage(chatId, "Important announcement!", {
  allow_paid_broadcast: true,
});
```

---

## 3. Telegram Business Integration

Telegram Business allows regular Telegram user accounts to connect a bot to manage, reply, and automate their private chats.

### 3.1 Business Connection Updates
```typescript
bot.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  console.log(`Business connection update:`);
  console.log(`ID: ${conn.id}, User: ${conn.user.first_name} (${conn.user.id})`);
  console.log(`Is Enabled: ${conn.is_enabled}, Can Reply: ${conn.can_reply}`);
});
```

### 3.2 Handling Business Messages
When a user sends a message to a business account connected to your bot:

```typescript
bot.on("business_message", async (ctx) => {
  const msg = ctx.businessMessage;
  console.log(`Received business message from customer in chat ${msg.chat.id}`);

  // Automatic replies will include business_connection_id automatically
  await ctx.reply("👋 Hello! Thanks for reaching out. We will get back to you shortly.");
});

bot.on("edited_business_message", async (ctx) => {
  console.log("Business message was edited");
});
```

---

## 4. Message Reactions (Bot API 7.0+)

### 4.1 Listening to Reactions
```typescript
// Specific reaction emoji
bot.reaction("🔥", async (ctx) => {
  await ctx.reply("Hot!");
});

// Reacting to any reaction update
bot.on("message_reaction", async (ctx) => {
  const { old_reaction, new_reaction } = ctx.messageReaction;
  console.log("Reactions changed from:", old_reaction, "to:", new_reaction);
});
```

### 4.2 Bot Setting Reactions on Messages
```typescript
bot.on("message:text", async (ctx) => {
  // Shortcut method:
  await ctx.react("👍");

  // Or set custom emoji reactions:
  await ctx.api.setMessageReaction(ctx.chat.id, ctx.msg.message_id, [
    { type: "emoji", emoji: "🎉" },
  ]);
});
```

---

## 5. Message Effects

Telegram allows bots to send messages with animated full-screen effects (e.g., flames, fireworks, confetti).

```typescript
// Known Telegram effect IDs:
const EFFECTS = {
  FIRE: "5104841245755180586",
  THUMBS_UP: "5107584321108051014",
  HEARTS: "5159385139981059251",
  CONFETTI: "5046509860389126442",
};

bot.command("congrats", async (ctx) => {
  await ctx.reply("🎉 Congratulations on leveling up!", {
    message_effect_id: EFFECTS.CONFETTI,
  });
});
```

---

## 6. Telegram Mini Apps (Web Apps)

### 6.1 Creating Web App Buttons
```typescript
import { InlineKeyboard } from "grammy";

const kb = new InlineKeyboard().webApp(
  "🚀 Launch Mini App",
  "https://my-telegram-mini-app.pages.dev"
);

await ctx.reply("Open our interactive mini app:", { reply_markup: kb });
```

### 6.2 Validating Mini App `initData` (Crypto Verification)
Telegram Mini Apps pass signed `initData` via `window.Telegram.WebApp.initData`. Always verify this cryptographically before trusting user state!

```typescript
import { createHmac } from "node:crypto";

export function verifyTelegramWebAppData(initData: string, botToken: string): boolean {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  if (!hash) return false;

  urlParams.delete("hash");

  // Sort keys alphabetically
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join("\n");

  // Generate secret key: HMAC-SHA256 of botToken with key "WebAppData"
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

  // Calculate signature of dataCheckString
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return calculatedHash === hash;
}
```

---

## 7. Forum Topics & Threads

For supergroups with forum topics enabled:

```typescript
bot.on("message", async (ctx) => {
  const threadId = ctx.msg.message_thread_id;
  if (threadId) {
    console.log(`Message received inside Forum Topic #${threadId}`);
    // Replies automatically stay within the same topic:
    await ctx.reply("Replied inside this topic thread!");
  }
});

// Explicitly send message to a topic:
await ctx.api.sendMessage(supergroupId, "Topic announcement", {
  message_thread_id: 12345,
});
```
