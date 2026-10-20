# Launch Modes, Deep Linking & Bot Integration

Telegram Mini Apps support **7 distinct launch modes**. Understanding how each mode initializes the Mini App is critical because the available return channel (`sendData` vs `answerWebAppQuery` vs direct HTTP backend) and the fields populated in `initData` depend on how the user opened the app.

---

## Table of Contents
1. [The 7 Launch Modes Explained](#1-the-7-launch-modes-explained)
2. [Deep Linking & `startapp` / `start_param`](#2-deep-linking--startapp--start_param)
3. [Returning Data to the Bot (`sendData` vs `answerWebAppQuery`)](#3-returning-data-to-the-bot-senddata-vs-answerwebappquery)
4. [Sharing Prepared Messages (`savePreparedInlineMessage` + `shareMessage`)](#4-sharing-prepared-messages-savepreparedinlinemessage--sharemessage)
5. [Payments with Telegram Stars (`openInvoice`)](#5-payments-with-telegram-stars-openinvoice)
6. [Requesting Bot Permissions & Chat Selection (`requestWriteAccess`, `requestContact`, `requestChat`)](#6-requesting-bot-permissions--chat-selection-requestwriteaccess-requestcontact-requestchat)

---

## 1. The 7 Launch Modes Explained

### 1.1 Keyboard Button Mini Apps (`KeyboardButton.web_app`)
Launched from a custom reply keyboard in a 1-on-1 private chat with the bot.
- **How to send from Bot API**:
  ```json
  {
    "keyboard": [[{ "text": "Open Order Form", "web_app": { "url": "https://example.com/form" } }]],
    "resize_keyboard": true
  }
  ```
- **How it returns data**: Calling `Telegram.WebApp.sendData(stringData)` sends a service message (`Message.web_app_data`) directly to the bot on behalf of the user and **immediately closes the Mini App**.
- **Critical Limitation**: `initDataUnsafe.user` is **not guaranteed / not provided** in standard Keyboard Button launches because communication is intended to happen via `sendData()`. Payload size is capped at **4096 bytes**.

### 1.2 Inline Button Mini Apps (`InlineKeyboardButton.web_app`)
Launched from an inline keyboard attached to a message sent by the bot in a private chat (or via inline mode).
- **How to send from Bot API**:
  ```json
  {
    "inline_keyboard": [[{ "text": "Launch Dashboard", "web_app": { "url": "https://example.com/app" } }]]
  }
  ```
- **What `initData` provides**: `user`, `query_id`, `auth_date`, `hash`, `signature`.
- **How it communicates**:
  1. Send authenticated HTTP requests directly to your backend with `Authorization: tma <Telegram.WebApp.initData>`.
  2. Optionally call `answerWebAppQuery(query_id, InlineQueryResult)` from your backend to post an inline message back into the chat where the button was pressed.

### 1.3 Bot Menu Button Mini Apps (`MenuButtonWebApp`)
Replaces the standard `/` command menu button in the bottom-left of a private chat with the bot.
- **Configure per-user or globally via Bot API (`setChatMenuButton`)**:
  ```json
  {
    "menu_button": {
      "type": "web_app",
      "text": "Open Shop",
      "web_app": { "url": "https://example.com/shop" }
    }
  }
  ```
- **Runtime behavior**: Identical to Inline Button Mini Apps (`user` and `query_id` are present; `sendData()` is **not** available).

### 1.4 Direct Link Mini Apps (`t.me/botusername/appname`)
Allows opening a registered Mini App (created via `@BotFather` -> `/newapp`) from **any** chat, group, channel, or external website link.
- **URL Formats**:
  - `https://t.me/<bot_username>/<app_short_name>`
  - `https://t.me/<bot_username>/<app_short_name>?startapp=<start_param>`
  - `https://t.me/<bot_username>/<app_short_name>?startapp=<start_param>&mode=compact` (or `mode=fullscreen`)
- **What `initData` provides**:
  - `user` (the user who clicked the link)
  - `start_param` (the value passed in `?startapp=...`)
  - `chat_type` (`"sender"`, `"private"`, `"group"`, `"supergroup"`, or `"channel"`) and `chat_instance` (a global identifier for the chat context where the link was clicked)
  - `chat` (populated if launched from a group/channel with appropriate context)
- **Important**: No `query_id` is generated in Direct Link mode! Your backend cannot call `answerWebAppQuery`; instead, either send messages using `sendMessage(user.id, ...)` (after ensuring `requestWriteAccess()`) or use `savePreparedInlineMessage` + `Telegram.WebApp.shareMessage()`.

### 1.5 Main Mini Apps (`t.me/botusername?startapp=...`)
Configured via `@BotFather` (`/mybots` -> Bot Settings -> Configure Mini App). Adds an **"Open App"** button directly to the bot's Telegram profile and allows launching without an `/appname` slug:
- **URL Formats**:
  - `https://t.me/<bot_username>?startapp`
  - `https://t.me/<bot_username>?startapp=<start_param>`
  - `https://t.me/<bot_username>?startapp=<start_param>&mode=compact`

### 1.6 Inline Mode Mini Apps (`InlineQueryResultButton`)
Displayed at the top of the inline query results popup when a user types `@yourbot ...` in any chat.
- **How to send from Bot API (`answerInlineQuery`)**:
  ```json
  {
    "inline_query_id": "...",
    "results": [],
    "button": {
      "text": "Create Custom Poll",
      "web_app": { "url": "https://example.com/create-poll" }
    }
  }
  ```
- When finished inside the Mini App, call `Telegram.WebApp.switchInlineQuery("poll_123", ["users", "groups"])` or call `answerWebAppQuery` from your backend using `initDataUnsafe.query_id`.

### 1.7 Attachment Menu Mini Apps
Allows users to launch your Mini App directly from the paperclip (attachment) menu in private, group, or channel chats (configured via `@BotFather` -> `/mybots` -> Bot Settings -> Attachment Menu).
- Provides `initDataUnsafe.user`, `query_id`, and (in 1-on-1 chats) `initDataUnsafe.receiver` representing the chat partner.

---

## 2. Deep Linking & `startapp` / `start_param`

When launching via `t.me/bot/app?startapp=ref_42` or `t.me/bot?startapp=ref_42`:
1. **Allowed Characters**: Only `A-Z`, `a-z`, `0-9`, `_` (underscore), and `-` (minus/hyphen), up to **512 characters**.
   - Need to pass complex JSON or query params? Encode with **Base64URL** (`Buffer.from(json).toString("base64url")`).
2. **How to Read in the Mini App**:
   - Via SDK object: `Telegram.WebApp.initDataUnsafe.start_param`
   - Via URL GET parameter (automatically appended by Telegram to your Mini App URL): `new URLSearchParams(window.location.search).get("tgWebAppStartParam")`
3. **Display Mode Parameter (`mode`)**:
   - Appending `&mode=compact` forces the Mini App to open in a half-screen bottom sheet.
   - Appending `&mode=fullscreen` (Bot API 8.0+) opens the Mini App directly in full-screen mode if configured or requested.

---

## 3. Returning Data to the Bot (`sendData` vs `answerWebAppQuery`)

### Pattern A: `Telegram.WebApp.sendData(data)` (Keyboard Button Only)
```ts
// Client-side (ONLY works when opened from a Reply KeyboardButton)
const payload = JSON.stringify({ itemId: "sku_99", quantity: 2 });
if (new TextEncoder().encode(payload).length > 4096) {
  throw new Error("sendData payload cannot exceed 4096 bytes");
}
Telegram.WebApp.sendData(payload); // Sends service message and closes Mini App
```

### Pattern B: `answerWebAppQuery` (Inline Button, Menu Button, Attachment Menu)
```ts
// 1. Client-side sends initData + payload to your backend via fetch()
await fetch("/api/checkout", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `tma ${Telegram.WebApp.initData}`,
  },
  body: JSON.stringify({ cartId: "c_100" }),
});

// 2. Backend verifies initData, extracts query_id, and calls Bot API answerWebAppQuery
// This posts an inline message into the chat on behalf of the user and closes the Mini App.
```

---

## 4. Sharing Prepared Messages (`savePreparedInlineMessage` + `shareMessage`)

Added in **Bot API 8.0**, `Telegram.WebApp.shareMessage(msg_id, callback)` works across **all** launch modes (including Direct Links where `query_id` is absent!) and opens a native Telegram dialog letting the user share a rich inline message to a chat or peer.

```ts
// Step 1 (Backend): Call Bot API `savePreparedInlineMessage`
const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_id: verifiedUser.id,
    result: {
      type: "article",
      id: "invite_1",
      title: "Join my game room!",
      input_message_content: {
        message_text: "Click below to join my game room!",
      },
      reply_markup: {
        inline_keyboard: [[{ text: "Join Room", url: "https://t.me/mybot/game?startapp=room_42" }]],
      },
    },
    allow_user_chats: true,
    allow_group_chats: true,
    allow_channel_chats: false,
  }),
});
const { result } = await response.json(); // { id: "prepared_msg_id", expiration_date: ... }

// Step 2 (Client Mini App): Prompt user to share the prepared message
if (Telegram.WebApp.isVersionAtLeast("8.0")) {
  Telegram.WebApp.shareMessage(result.id, (sent: boolean) => {
    if (sent) {
      Telegram.WebApp.HapticFeedback.notificationOccurred("success");
    }
  });
}
```

---

## 5. Payments with Telegram Stars (`openInvoice`)

Digital goods and services inside Telegram Mini Apps must use **Telegram Stars (`XTR`)**.
1. **Backend**: Call Bot API `createInvoiceLink` with `currency: "XTR"` and `provider_token: ""` (empty string for Stars). This returns an invoice URL (`https://t.me/$...`).
2. **Client Mini App**: Call `Telegram.WebApp.openInvoice(invoiceUrl, callback)`:

```ts
Telegram.WebApp.openInvoice(invoiceUrl, (status) => {
  // status is one of: "paid" | "cancelled" | "failed" | "pending"
  if (status === "paid") {
    Telegram.WebApp.HapticFeedback.notificationOccurred("success");
    refreshUserPurchases();
  } else if (status === "cancelled") {
    console.log("User cancelled payment");
  } else if (status === "failed") {
    Telegram.WebApp.showAlert("Payment failed. Please try again.");
  }
});
```

---

## 6. Requesting Bot Permissions & Chat Selection (`requestWriteAccess`, `requestContact`, `requestChat`)

When a user opens a Direct Link Mini App (`t.me/bot/app`) without ever having started your bot (`/start`), your bot cannot DM them unless they grant write access:

### `requestWriteAccess([callback])` (Bot API 6.9+)
```ts
if (Telegram.WebApp.isVersionAtLeast("6.9")) {
  // First check initDataUnsafe.user?.allows_write_to_pm
  if (!Telegram.WebApp.initDataUnsafe.user?.allows_write_to_pm) {
    Telegram.WebApp.requestWriteAccess((granted: boolean) => {
      if (granted) console.log("Bot can now send private messages to the user!");
    });
  }
}
```

### `requestContact([callback])` (Bot API 6.9+)
Prompts the user with a native confirmation sheet to share their verified phone number with the bot:
```ts
Telegram.WebApp.requestContact((shared: boolean) => {
  if (shared) {
    // The bot also receives a Message with `contact` via webhook/polling
    console.log("User shared their phone number");
  }
});
```

### `requestChat(request_id, [callback])` (Bot API 9.6+)
Prompts the user to pick a chat matching criteria configured with the bot (`KeyboardButtonRequestChat` / `chat_shared` flow):
```ts
if (Telegram.WebApp.isVersionAtLeast("9.6")) {
  Telegram.WebApp.requestChat(requestId, (success: boolean) => {
    if (success) console.log("Chat selected and shared with bot");
  });
}
```
