const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const BUNDLE_ID = /^b_[A-Za-z0-9_-]{8,128}$/;

function serviceUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim().replace(/\/$/, "");
  if (!base) return path;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("Hosted bundle API must use HTTPS in production.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("must use HTTPS")) throw error;
    throw new Error("Hosted bundle API configuration is invalid.");
  }
  return `${base}${path}`;
}

export async function loadHostedBundle(bundleId: string, signal?: AbortSignal) {
  if (!BUNDLE_ID.test(bundleId)) throw new Error("This hosted bundle link is invalid.");
  const response = await fetch(serviceUrl(`/api/bundles/${encodeURIComponent(bundleId)}`), {
    redirect: "error",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) throw new Error("This hosted bundle has expired or no longer exists.");
    throw new Error(`The hosted bundle could not be loaded (HTTP ${response.status}).`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BUNDLE_BYTES) throw new Error("This hosted bundle is too large to open in Explorer.");
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BUNDLE_BYTES) throw new Error("This hosted bundle is too large to open in Explorer.");
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BUNDLE_BYTES) {
        await reader.cancel();
        throw new Error("This hosted bundle is too large to open in Explorer.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
