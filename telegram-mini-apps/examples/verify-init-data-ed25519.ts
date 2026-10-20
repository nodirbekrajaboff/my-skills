/**
 * Third-Party Cryptographic Validator for Telegram Mini App `initData` (Ed25519 `signature`)
 * Verifies authenticity using ONLY your numeric `botId` and Telegram's official Ed25519 Public Key.
 * Does NOT require your secret Bot Token! (Added in Bot API 8.0)
 */

import { verify as cryptoVerify, createPublicKey } from "node:crypto";

/**
 * Official Telegram Ed25519 Public Keys (32-byte raw hex)
 * Source: https://core.telegram.org/bots/webapps#validating-data-for-third-party-use
 */
export const TELEGRAM_ED25519_PUBLIC_KEYS = {
  production: "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
  test: "40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec",
} as const;

// ASN.1 DER SubjectPublicKeyInfo (SPKI) prefix for a 32-byte Ed25519 public key (RFC 8410)
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Validates `window.Telegram.WebApp.initData` for Third-Party services using Ed25519.
 *
 * @param initDataRaw Raw query string from `Telegram.WebApp.initData`
 * @param botId Numeric Bot ID (e.g. `123456789` or `"123456789"`)
 * @param options Optional environment (`"production"` | `"test"`) and `maxAgeSeconds`
 */
export function validateInitDataThirdPartyEd25519(
  initDataRaw: string,
  botId: number | string,
  options: { environment?: "production" | "test"; maxAgeSeconds?: number } = {}
) {
  const { environment = "production", maxAgeSeconds = 3600 } = options;

  const params = new URLSearchParams(initDataRaw);
  const signatureBase64Url = params.get("signature");
  if (!signatureBase64Url) {
    throw new Error("Missing 'signature' parameter in initData (requires Bot API 8.0+)");
  }

  // For Third-Party Ed25519 validation, remove BOTH `hash` and `signature`
  params.delete("hash");
  params.delete("signature");

  const sortedPairs = Array.from(params.entries())
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // Prefix with `<bot_id>:WebAppData\n`
  const dataCheckString = `${botId}:WebAppData\n${sortedPairs}`;

  // Construct SPKI Public Key object from Telegram's 32-byte raw Ed25519 hex key
  const rawPubKey = Buffer.from(TELEGRAM_ED25519_PUBLIC_KEYS[environment], "hex");
  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawPubKey]);
  const publicKey = createPublicKey({ key: spkiDer, format: "der", type: "spki" });

  const signatureBuffer = Buffer.from(signatureBase64Url, "base64url");
  const isValid = cryptoVerify(
    null, // Ed25519 does not use a separate digest algorithm
    Buffer.from(dataCheckString, "utf-8"),
    publicKey,
    signatureBuffer
  );

  if (!isValid) {
    throw new Error("Invalid Telegram Third-Party Ed25519 signature");
  }

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
    botId: String(botId),
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    user: params.has("user") ? JSON.parse(params.get("user")!) : undefined,
    chat: params.has("chat") ? JSON.parse(params.get("chat")!) : undefined,
  };
}
