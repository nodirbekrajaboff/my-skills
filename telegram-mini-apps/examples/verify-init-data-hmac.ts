/**
 * First-Party Cryptographic Validator for Telegram Mini App `initData` (HMAC-SHA256)
 * Uses Node.js built-in `node:crypto` with constant-time comparison (`timingSafeEqual`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedInitData {
  authDate: number;
  hash: string;
  signature?: string;
  queryId?: string;
  startParam?: string;
  chatType?: string;
  chatInstance?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    allows_write_to_pm?: boolean;
    photo_url?: string;
  };
  chat?: {
    id: number;
    type: "group" | "supergroup" | "channel";
    title: string;
    username?: string;
    photo_url?: string;
  };
}

/**
 * Validates `window.Telegram.WebApp.initData` using your Bot Token.
 *
 * @param initDataRaw Raw query string from `Telegram.WebApp.initData`
 * @param botToken Secret Telegram Bot Token (`123456:ABC-DEF...`)
 * @param maxAgeSeconds Maximum allowed age of `auth_date` in seconds (default: 3600 = 1 hour)
 */
export function validateInitDataHmac(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 3600
): VerifiedInitData {
  if (!initDataRaw || typeof initDataRaw !== "string") {
    throw new Error("initData must be a non-empty query string");
  }

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Missing 'hash' parameter in initData");
  }

  // Delete ONLY `hash` when computing the HMAC data-check-string (keep `signature`!)
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // Step 1: HMAC-SHA256(key = "WebAppData", msg = botToken)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

  // Step 2: HMAC-SHA256(key = secretKey, msg = dataCheckString)
  const calculatedHashHex = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const receivedHashBuf = Buffer.from(hash, "hex");
  const calculatedHashBuf = Buffer.from(calculatedHashHex, "hex");

  if (
    receivedHashBuf.length !== calculatedHashBuf.length ||
    !timingSafeEqual(receivedHashBuf, calculatedHashBuf)
  ) {
    throw new Error("Invalid Telegram initData HMAC signature");
  }

  // Step 3: Prevent replay attacks via auth_date check
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error("Invalid 'auth_date' in initData");
  }

  if (maxAgeSeconds > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > maxAgeSeconds) {
      throw new Error(`initData expired (age: ${nowSeconds - authDate}s > maxAge: ${maxAgeSeconds}s)`);
    }
  }

  return {
    authDate,
    hash,
    signature: params.get("signature") ?? undefined,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    chatType: params.get("chat_type") ?? undefined,
    chatInstance: params.get("chat_instance") ?? undefined,
    user: params.has("user") ? JSON.parse(params.get("user")!) : undefined,
    chat: params.has("chat") ? JSON.parse(params.get("chat")!) : undefined,
  };
}
