const api = process.argv[2];
const bundleId = process.argv[3];

if (!api) {
  console.error("usage: node services/bundle-service/smoke-hosted.mjs <api-url> [bundle-id]");
  process.exit(2);
}

const base = new URL(api);
if (base.protocol !== "https:") throw new Error("smoke target must use HTTPS");
base.pathname = base.pathname.replace(/\/$/, "");

async function request(path, options) {
  const response = await fetch(new URL(path, base), {
    redirect: "error",
    headers: { Accept: "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const invalidId = await request("/api/bundles/not-a-bundle");
if (invalidId.response.status !== 400) throw new Error(`invalid bundle ID returned HTTP ${invalidId.response.status}`);

const invalidBuild = await request("/api/build", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ git_url: "http://invalid.example/repository" }),
});
if (invalidBuild.response.status !== 400) throw new Error(`invalid build request returned HTTP ${invalidBuild.response.status}`);

if (bundleId) {
  if (!/^b_[A-Za-z0-9_-]{8,128}$/.test(bundleId)) throw new Error("bundle ID argument is invalid");
  const bundle = await request(`/api/bundles/${encodeURIComponent(bundleId)}`);
  if (bundle.response.status !== 200) throw new Error(`bundle returned HTTP ${bundle.response.status}`);
  if (bundle.body?.format !== "lachesis-explorer-bundle" || bundle.body?.schema_version !== "2.0" || !Array.isArray(bundle.body?.graph?.nodes)) {
    throw new Error("bundle is not a graph-first v2 artifact");
  }
}

console.log(bundleId ? "hosted API smoke test passed with bundle resolution" : "hosted API smoke test passed");
