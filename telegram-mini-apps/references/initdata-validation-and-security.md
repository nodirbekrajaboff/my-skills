# Cryptographic `initData` Validation & Security (First-Party HMAC & Third-Party Ed25519)

Every request from your Mini App frontend to your backend **must** pass the raw, unmodified `window.Telegram.WebApp.initData` query string (for example, in an `Authorization: tma <initData>` header). Never send or trust `initDataUnsafe` JSON fields directly without verifying the cryptographic signature.

Telegram supports **two** official verification mechanisms:
1. **First-Party Validation (HMAC-SHA256)**: Uses your secret **Bot Token**. Use this on your own backend servers.
2. **Third-Party Validation (Ed25519 `signature`, Bot API 8.0+)**: Uses **Telegram's static Ed25519 Public Key** and your public numeric **`bot_id`**. Use this when an external service, smart contract oracle, BaaS (Supabase/Firebase), or partner API needs to verify a user's `initData` **without** ever having access to your secret Bot Token.

---

## Table of Contents
1. [First-Party Validation: HMAC-SHA256 with Bot Token](#1-first-party-validation-hmac-sha256-with-bot-token)
2. [Third-Party Validation: Ed25519 with Telegram Public Key](#2-third-party-validation-ed25519-with-telegram-public-key)
3. [Replay Attack Prevention (`auth_date`) & Common Pitfalls](#3-replay-attack-prevention-auth_date--common-pitfalls)
4. [Testing Environment & Debug Mode Setup](#4-testing-environment--debug-mode-setup)

---

## 1. First-Party Validation: HMAC-SHA256 with Bot Token

### Step-by-Step Algorithm
Given the raw `initData` query string (e.g., `query_id=AAHd...&user=%7B...%7D&auth_date=1730000000&signature=...&hash=a1b2c3...`):

1. **Parse as URLSearchParams**: Decode key-value pairs from the raw query string.
2. **Extract `hash`**: Save the `hash` value (64-character hex string) and **delete ONLY `hash`** from the parameters map.
   - **Important**: Do **NOT** remove `signature` when computing the First-Party HMAC-SHA256 `data_check_string`! Every field present in `initData` except `hash` is included.
3. **Construct `data_check_string`**:
   - Sort all remaining `[key, value]` pairs alphabetically by `key` (`a < b`).
   - Format each pair as `${key}=${value}` and join them with a single newline (`\n`).
4. **Derive `secret_key`**:
   - Compute `HMAC-SHA256(key = "WebAppData", message = BOT_TOKEN)`.
   - Notice the order: the constant string `"WebAppData"` is the **HMAC Key**, and your `BOT_TOKEN` is the **message**!
5. **Compute `calculated_hash`**:
   - Compute `HMAC-SHA256(key = secret_key, message = data_check_string)` and encode as lowercase hexadecimal.
6. **Constant-Time Comparison**:
   - Compare `calculated_hash` with `hash` using `crypto.timingSafeEqual` so timing side-channels cannot leak signature bytes.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTelegramInitDataHmac(initDataRaw: string, botToken: string, maxAgeSeconds = 86400) {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing hash in initData");

  // Remove ONLY `hash` (keep `signature` if present!)
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // Key is "WebAppData", data is botToken
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const calcBuf = Buffer.from(calculatedHash, "hex");
  if (hashBuf.length !== calcBuf.length || !timingSafeEqual(hashBuf, calcBuf)) {
    throw new Error("Invalid initData HMAC signature");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    throw new Error("Expired initData auth_date");
  }

  return {
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    user: params.has("user") ? JSON.parse(params.get("user")!) : undefined,
    chat: params.has("chat") ? JSON.parse(params.get("chat")!) : undefined,
  };
}
```

---

## 2. Third-Party Validation: Ed25519 with Telegram Public Key

Added in **Bot API 8.0**, every `initData` string also includes a base64url-encoded `signature` parameter signed by Telegram's private Ed25519 key. Any third party that knows your public numeric **`bot_id`** (the numbers before the colon `:` in your bot token, e.g. `123456789`) can verify the payload without knowing the secret bot token.

### Official Telegram Ed25519 Public Keys (Hex)
- **Production Environment**:
  `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`
- **Test Environment**:
  `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`

### Step-by-Step Algorithm
1. **Parse `initData`**: Extract `signature` (Base64URL-encoded 64-byte Ed25519 signature).
2. **Delete BOTH `hash` and `signature`** from the parameter map.
3. **Construct `data_check_string`**:
   - Sort remaining `[key, value]` pairs alphabetically by `key` and join as `${key}=${value}` with `\n`.
   - Prefix the string with `${botId}:WebAppData\n`:
     ```text
     123456789:WebAppData
     auth_date=1730000000
     query_id=AAHd...
     user={"id":999,...}
     ```
4. **Verify Ed25519 Signature**:
   - Decode `signature` from Base64URL to raw bytes (64 bytes).
   - Verify against the UTF-8 bytes of `data_check_string` using Telegram's Ed25519 public key.

*(See [`examples/verify-init-data-ed25519.ts`](../examples/verify-init-data-ed25519.ts) for a complete zero-dependency Node.js / Web Crypto implementation.)*

---

## 3. Replay Attack Prevention (`auth_date`) & Common Pitfalls

1. **Always Check `auth_date` Freshness**:
   `initData` signatures are deterministic and do not expire cryptographically on their own. Always assert `Math.floor(Date.now() / 1000) - auth_date <= maxAgeSeconds` (e.g., `3600` for 1 hour on sensitive endpoints, or exchange `initData` once at login for your own short-lived JWT/session cookie).
2. **Do Not Re-Serialize `user` JSON Before Hashing**:
   `URLSearchParams` automatically URL-decodes parameter values once, which is what Telegram expects in `data_check_string` (`user={"id":123,"first_name":"Alice",...}`). Never `JSON.parse()` and `JSON.stringify()` the `user` object before constructing `data_check_string`, as key ordering or escaping differences will break the hash.
3. **Keep `signature` in First-Party HMAC, Remove `signature` in Third-Party Ed25519**:
   - For **HMAC-SHA256** (Bot Token): delete **only** `hash`. Keep `signature` in the sorted parameter list!
   - For **Ed25519** (Public Key): delete **both** `hash` and `signature`.

---

## 4. Testing Environment & Debug Mode Setup

### Enabling WebView Inspector / DevTools in Telegram Clients
- **Telegram Desktop (Windows / Linux / macOS)**:
  Settings → Advanced → Experimental settings → Enable **"Enable webview inspection"**. Right-click inside the Mini App and select **Inspect**.
- **Telegram macOS (Native Swift client)**:
  Quickly click the Settings gear icon 10 times to open the Debug Menu → click **"Toggle WebView Inspection"**, then open Safari → Develop → your Mac → WebView.
- **Telegram Android**:
  Settings → scroll to the very bottom → press and hold the version number twice to open Debug Menu → **"Enable WebView Debug"**. Inspect via Chrome `chrome://inspect/#devices` over USB.
- **Telegram iOS**:
  Tap Settings icon 10 times → enable WebView inspection → inspect via macOS Safari Develop menu.
