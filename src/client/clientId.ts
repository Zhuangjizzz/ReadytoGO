let sequence = 0;
export function newClientId(prefix = "item"): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function")
    return `${prefix}_${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === "function")
    crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}_${Date.now().toString(36)}_${(++sequence).toString(36)}`;
}
