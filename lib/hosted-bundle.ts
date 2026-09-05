const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const BUNDLE_ID = /^b_[A-Za-z0-9_-]{8,128}$/;

function serviceUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim().replace(/\/$/, "");
  if (!base) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Hosted repository builds are not configured. Load a bundle.json or set NEXT_PUBLIC_BUNDLE_API_URL.");
    }
    return path;
  }
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

function requestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchHosted(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The hosted bundle service did not respond in time. Try again.");
    }
    throw new Error("The hosted bundle service could not be reached. Check your connection and try again.");
  }
}

export async function loadHostedBundle(bundleId: string, signal?: AbortSignal) {
  if (!BUNDLE_ID.test(bundleId)) throw new Error("This hosted bundle link is invalid.");
  const response = await fetchHosted(serviceUrl(`/api/bundles/${encodeURIComponent(bundleId)}`), {
    redirect: "error",
    signal: requestSignal(signal),
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

export type RepositoryIndex = {
  schema_version?: string;
  repository?: string;
  git_url?: string;
  ref?: string;
  revision?: string;
  bundle_id: string;
  bundle_url?: string;
  built_at?: number;
  cache_hit?: boolean;
};

const REPOSITORY_PART = /^[A-Za-z0-9._-]{1,100}$/;
const REPOSITORY_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);

export async function loadHostedRepository(host: string, owner: string, repo: string, revision?: string, signal?: AbortSignal): Promise<RepositoryIndex> {
  if (!REPOSITORY_HOSTS.has(host) || !REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(repo)) {
    throw new Error("This repository link is invalid.");
  }
  if (revision && !/^[0-9a-f]{40,64}$/i.test(revision)) throw new Error("This repository revision is invalid.");
  if (!process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim()) {
    throw new Error("Canonical repository links are not configured on this server. Load a bundle.json or configure the hosted API.");
  }
  const route = host === "github.com"
    ? `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    : `/api/repos/${encodeURIComponent(host)}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const suffix = revision ? `?revision=${encodeURIComponent(revision)}` : "";
  const response = await fetchHosted(serviceUrl(`${route}${suffix}`), {
    redirect: "error",
    signal: requestSignal(signal),
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    throw new Error("This repository has not been built on Lachesis yet. Submit it from the home page to create its graph.");
  }
  if (!response.ok) throw await requestError(response, `The repository index could not be loaded (HTTP ${response.status}).`);
  const body = await responseJson(response);
  if (typeof body.bundle_id !== "string" || !BUNDLE_ID.test(body.bundle_id)) {
    throw new Error("The repository index returned an invalid bundle link.");
  }
  return body as RepositoryIndex;
}

export async function loadHostedRepositories(signal?: AbortSignal): Promise<RepositoryIndex[]> {
  if (!process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim()) return [];
  const response = await fetchHosted(serviceUrl("/api/repos"), {
    redirect: "error",
    signal: requestSignal(signal),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await requestError(response, `The repository gallery could not be loaded (HTTP ${response.status}).`);
  const body = await responseJson(response);
  if (!Array.isArray(body.repositories)) throw new Error("The repository gallery returned an invalid response.");
  return body.repositories.filter((item): item is RepositoryIndex => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).bundle_id === "string" && BUNDLE_ID.test((item as Record<string, unknown>).bundle_id as string));
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

async function responseJson(response: Response) {
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new Error("The hosted bundle service returned an invalid response.");
  }
}

export async function submitHostedBuild(gitUrl: string, ref: string, signal?: AbortSignal): Promise<BuildResponse> {
  const response = await fetchHosted(serviceUrl("/api/build"), {
    method: "POST",
    redirect: "error",
    signal: requestSignal(signal),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ git_url: gitUrl, ...(ref ? { ref } : {}) }),
  });
  if (response.status === 404 && !process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim()) {
    throw new Error("Hosted repository builds are not configured for this local server. Load a bundle.json or set NEXT_PUBLIC_BUNDLE_API_URL.");
  }
  if (!response.ok) throw await requestError(response, `The build request failed (HTTP ${response.status}).`);
  return (await responseJson(response)) as BuildResponse;
}

export async function getHostedBuildStatus(jobId: string, signal?: AbortSignal): Promise<BuildResponse> {
  if (!/^j_[A-Za-z0-9_-]{8,128}$/.test(jobId)) throw new Error("The build job ID is invalid.");
  const response = await fetchHosted(serviceUrl(`/api/build/${encodeURIComponent(jobId)}`), { redirect: "error", signal: requestSignal(signal), headers: { Accept: "application/json" } });
  if (!response.ok) throw await requestError(response, `The build status could not be read (HTTP ${response.status}).`);
  return (await responseJson(response)) as BuildResponse;
}

export async function cancelHostedBuild(jobId: string, signal?: AbortSignal): Promise<BuildResponse> {
  if (!/^j_[A-Za-z0-9_-]{8,128}$/.test(jobId)) throw new Error("The build job ID is invalid.");
  const response = await fetchHosted(serviceUrl(`/api/build/${encodeURIComponent(jobId)}/cancel`), {
    method: "POST", redirect: "error", signal: requestSignal(signal), headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await requestError(response, `The build could not be cancelled (HTTP ${response.status}).`);
  return (await responseJson(response)) as BuildResponse;
}
