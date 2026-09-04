const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const BUNDLE_ID = /^b_[A-Za-z0-9_-]{8,128}$/;

function serviceUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim().replace(/\/$/, "");
  if (!base) return path;
  try {
    const parsed = new URL(base);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("Hosted bundle API configuration must be an origin and path only.");
    }
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("Hosted bundle API must use HTTPS in production.");
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes("must use HTTPS") || error.message.includes("origin and path"))) throw error;
    throw new Error("Hosted bundle API configuration is invalid.");
  }
  return `${base}${path}`;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The hosted bundle response was not valid JSON.");
  }
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
    return parseJson(text);
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
  return parseJson(new TextDecoder().decode(bytes));
}

export type BuildStatus = "queued" | "cloning" | "building" | "exporting" | "ready" | "too_large" | "unsupported_language" | "error" | "expired" | "cancelled";
export type BuildResponse = { job_id?: string; status: BuildStatus; bundle_id?: string; sha?: string; steps?: Array<{ key: string; state: string }>; error?: { message?: string; kind?: string } };

export class HostedRequestError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "HostedRequestError";
    this.retryAfterMs = retryAfterMs;
  }
}

function getRetryAfterMs(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(30_000, Math.max(0, date - Date.now()));
}

async function requestError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return new HostedRequestError(body?.error?.message || fallback, getRetryAfterMs(response));
}

export async function submitHostedBuild(gitUrl: string, ref: string, signal?: AbortSignal): Promise<BuildResponse> {
  const response = await fetch(serviceUrl("/api/build"), {
    method: "POST",
    redirect: "error",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ git_url: gitUrl, ...(ref ? { ref } : {}) }),
  });
  if (!response.ok) throw await requestError(response, `The build request failed (HTTP ${response.status}).`);
  const body = await response.json().catch(() => ({}));
  return body as BuildResponse;
}

export async function getHostedBuildStatus(jobId: string, signal?: AbortSignal): Promise<BuildResponse> {
  if (!/^j_[A-Za-z0-9_-]{8,128}$/.test(jobId)) throw new Error("The build job ID is invalid.");
  const response = await fetch(serviceUrl(`/api/build/${encodeURIComponent(jobId)}`), { redirect: "error", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw await requestError(response, `The build status could not be read (HTTP ${response.status}).`);
  const body = await response.json().catch(() => ({}));
  return body as BuildResponse;
}

export async function cancelHostedBuild(jobId: string, signal?: AbortSignal): Promise<BuildResponse> {
  if (!/^j_[A-Za-z0-9_-]{8,128}$/.test(jobId)) throw new Error("The build job ID is invalid.");
  const response = await fetch(serviceUrl(`/api/build/${encodeURIComponent(jobId)}/cancel`), {
    method: "POST", redirect: "error", signal, headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await requestError(response, `The build could not be cancelled (HTTP ${response.status}).`);
  return (await response.json().catch(() => ({}))) as BuildResponse;
}
