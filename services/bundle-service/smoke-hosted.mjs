const args = process.argv.slice(2);
const api = args.shift();
const buildIndex = args.indexOf("--build-url");
const buildUrl = buildIndex >= 0 ? args.splice(buildIndex, 2)[1] : undefined;
const refIndex = args.indexOf("--ref");
const buildRef = refIndex >= 0 ? args.splice(refIndex, 2)[1] : undefined;
const bundleId = args.shift();

if (!api || args.length > 0 || (buildIndex >= 0 && !buildUrl) || (refIndex >= 0 && !buildRef) || (refIndex >= 0 && !buildUrl)) {
  console.error("usage: node services/bundle-service/smoke-hosted.mjs <api-url> [bundle-id] [--build-url <repo>] [--ref <ref>]");
  process.exit(2);
}

const base = new URL(api);
if (base.protocol !== "https:") throw new Error("smoke target must use HTTPS");
base.pathname = base.pathname.replace(/\/$/, "");

async function request(path, options) {
  const target = new URL(base);
  target.pathname = `${base.pathname}${path}`;
  target.search = "";
  const response = await fetch(target, {
    redirect: "error",
    headers: { Accept: "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function assertBundle(bundle) {
  if (bundle?.format !== "lachesis-explorer-bundle" || bundle?.schema_version !== "2.0" || !Array.isArray(bundle?.graph?.nodes)) {
    throw new Error("bundle is not a graph-first v2 artifact");
  }
}

async function resolveBundle(id) {
  if (!/^b_[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error("bundle ID argument is invalid");
  const bundle = await request(`/api/bundles/${encodeURIComponent(id)}`);
  if (bundle.response.status !== 200) throw new Error(`bundle returned HTTP ${bundle.response.status}`);
  assertBundle(bundle.body);
}

const invalidId = await request("/api/bundles/not-a-bundle");
if (invalidId.response.status !== 400) throw new Error(`invalid bundle ID returned HTTP ${invalidId.response.status}`);

const invalidBuild = await request("/api/build", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ git_url: "http://invalid.example/repository" }),
});
if (invalidBuild.response.status !== 400) throw new Error(`invalid build request returned HTTP ${invalidBuild.response.status}`);

if (buildUrl) {
  const build = await request("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ git_url: buildUrl, ...(buildRef ? { ref: buildRef } : {}) }),
  });
  if (![200, 202].includes(build.response.status) || !/^j_[A-Za-z0-9_-]{8,128}$/.test(build.body?.job_id || "")) {
    throw new Error(`hosted build submission returned HTTP ${build.response.status}`);
  }

  const deadline = Date.now() + 15 * 60 * 1000;
  let status = build.body;
  while (status.status !== "ready") {
    if (["error", "expired", "cancelled", "too_large", "unsupported_language"].includes(status.status)) {
      throw new Error(`hosted build ended with status ${status.status}`);
    }
    if (Date.now() >= deadline) throw new Error("hosted build smoke test timed out");
    const retryAfter = Number(status.retry_after_seconds);
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(30_000, retryAfter * 1000) : 5_000));
    const result = await request(`/api/build/${encodeURIComponent(status.job_id)}`);
    if (result.response.status !== 200) throw new Error(`hosted build status returned HTTP ${result.response.status}`);
    status = result.body;
  }
  if (!status.bundle_id) throw new Error("ready build did not return a bundle ID");
  await resolveBundle(status.bundle_id);
  console.log("hosted API smoke test passed with build and bundle resolution");
} else if (bundleId) {
  await resolveBundle(bundleId);
  console.log("hosted API smoke test passed with bundle resolution");
} else {
  console.log("hosted API contract smoke test passed");
}
