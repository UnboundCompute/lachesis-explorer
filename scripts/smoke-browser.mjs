import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3000";
const hosted = process.env.EXPECT_ANALYTICS === "true" || /https:\/\/(?:[^/]+\.)?(?:vercel\.app|lachesis\.unboundcompute\.com)/.test(base);
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));

   await page.goto(`${base}/`, { waitUntil: "networkidle" });
   assert.equal(await page.title(), "Lachesis — Deterministic code graph reader");
    const landingText = await page.locator("body").innerText();
    assert.match(landingText, /Understand a codebase without opening every file/i, "source picker was not surfaced");
    assert.doesNotMatch(landingText, /Synthetic working bundle|example\/webapp/i, "starter bundle leaked onto the first-run surface");
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(dimensions.scrollWidth, dimensions.width, `horizontal overflow at ${viewport.width}px`);
    assert.equal(await page.locator('meta[name="generator"]').count(), 0, "framework metadata is exposed");
    const analyticsLoaded = await page.locator('script[src*="_vercel/insights"]').count() > 0;
    assert.equal(analyticsLoaded, hosted, hosted ? "hosted analytics did not load" : "analytics loaded outside Vercel");
    assert.deepEqual(errors, [], `browser errors at ${viewport.width}px`);
    await page.close();
  }

 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 await page.goto(`${base}/?view=map`, { waitUntil: "networkidle" });
 await page.locator("#bundle-upload").setInputFiles("public/code-exploration-bundle.json");
 await page.getByText("What do you want to understand?", { exact: true }).waitFor();
 await page.getByRole("button", { name: /^Explore See the codebase$/ }).click();
 assert.equal(await page.getByRole("button", { name: "Map", exact: true }).getAttribute("aria-pressed"), "true", "Explore did not default to Map");
  assert.equal(new URL(page.url()).searchParams.get("mode"), "simple", "fresh bundle did not default to Simple mode");
  const modeToggle = page.getByRole("button", { name: /Switch to dense mode/i });
  await modeToggle.click();
  assert.equal(new URL(page.url()).searchParams.get("mode"), "dense", "Dense mode did not update the URL");
  assert.equal(await page.getByRole("button", { name: /Switch to simple mode/i }).count(), 1, "Dense mode toggle did not update its label");
  await page.getByRole("button", { name: /Switch to simple mode/i }).click();
  assert.equal(new URL(page.url()).searchParams.get("mode"), "simple", "Simple mode did not restore from Dense mode");
  await page.getByRole("button", { name: /^Understand/ }).first().click();
  const simpleHomeText = await page.locator("body").innerText();
  assert.match(simpleHomeText, /Follow “POST \/api\/search”/, "Simple home did not feature the exported request flow");
  assert.doesNotMatch(simpleHomeText, /re\.split|redos/i, "Simple home featured a security/value path instead of the request flow");
  await page.getByRole("button", { name: /^Explore See the codebase$/ }).click();
  const nodes = page.locator(".topology-node-list button");
  assert.ok(await nodes.count() > 0, "graph node list is empty");
  await nodes.first().click();
  assert.equal(await page.locator("#source-inspector").count(), 1, "node selection did not open inspector");
  for (const [label, view] of [["Trace", "trace"]]) {
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
    assert.equal(new URL(page.url()).searchParams.get("view"), view, `${label} navigation failed`);
    if (view === "trace") {
      assert.equal(await page.getByRole("button", { name: "Previous step", exact: true }).count(), 1, "trace step navigation is ambiguous");
      assert.equal(await page.getByRole("button", { name: "Next step", exact: true }).count(), 1, "trace step navigation is ambiguous");
    }
  }
  const simpleTraceText = await page.locator("body").innerText();
  assert.match(simpleTraceText, /FOLLOW A PATH/, "Simple Trace did not use reader-facing vocabulary");
  assert.doesNotMatch(simpleTraceText, /GRAPH-PATH LENS|limited projection/i, "Simple Trace exposed Dense diagnostics");
  assert.equal(await page.getByRole("button", { name: /^Compare/ }).count(), 0, "Simple mode exposed the Compare lens");
  await page.getByRole("button", { name: /^More/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: /^What reaches here/ }).count(), 0, "Simple mode exposed the Boundary lens");
  assert.equal(await page.getByRole("menuitem", { name: /^Request flow/ }).count(), 1, "Simple mode hid the Request flow lens");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Switch to dense mode/i }).click();
  const denseTraceText = await page.locator("body").innerText();
  assert.match(denseTraceText, /GRAPH-PATH LENS/, "Dense Trace did not retain analyst vocabulary");
  for (const [label, view] of [["Compare", "compare"], ["Understand", "home"]]) {
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
    assert.equal(new URL(page.url()).searchParams.get("view"), view, `${label} navigation failed in Dense mode`);
  }
  await page.getByRole("button", { name: /^More/ }).click();
  const requestFlowItem = page.getByRole("menuitem", { name: /^Request flow/ });
  assert.equal(await requestFlowItem.count(), 1, "More menu did not expose focused views");
  await requestFlowItem.click();
  assert.equal(new URL(page.url()).searchParams.get("view"), "journey", "More menu navigation failed");
 await page.close();
 const explicitModePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 await explicitModePage.goto(`${base}/?mode=dense`, { waitUntil: "networkidle" });
 await explicitModePage.locator("#bundle-upload").setInputFiles("public/code-exploration-bundle.json");
 await explicitModePage.getByText("What do you want to understand?", { exact: true }).waitFor();
 assert.equal(new URL(explicitModePage.url()).searchParams.get("mode"), "dense", "explicit Dense URL mode was not preserved");
 await explicitModePage.close();
 const projectionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const projectionPayload = JSON.parse(fs.readFileSync("public/demo-bundle.json", "utf8"));
  projectionPayload.evidence_manifest.analysis_projection = "code-understanding";
  projectionPayload.security = { findings: [{ finding_id: "optional-security-context", witness: { steps: [{ node_id: "route.search" }] } }] };
  await projectionPage.goto(`${base}/`, { waitUntil: "networkidle" });
  await projectionPage.locator("#bundle-upload").setInputFiles({ name: "projection-bundle.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(projectionPayload)) });
 await projectionPage.waitForFunction(() => document.body.innerText.includes("Understand demo/atlas-commerce"), undefined, { timeout: 10_000 });
  const projectionText = await projectionPage.locator("body").innerText();
  assert.match(projectionText, /Understand demo\/atlas-commerce/, "explicit code-understanding projection entered the wrong mode");
  assert.doesNotMatch(projectionText, /Security evidence projection/, "optional findings overrode code-understanding mode");
  await projectionPage.close();

 const invalidSourceTemplatePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const invalidTemplatePayload = JSON.parse(fs.readFileSync("public/demo-bundle.json", "utf8"));
  invalidTemplatePayload.meta.source_url_template = "https://example.com/{revision}";
  await invalidSourceTemplatePage.goto(`${base}/`, { waitUntil: "networkidle" });
  await invalidSourceTemplatePage.locator("#bundle-upload").setInputFiles({ name: "invalid-source-template.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalidTemplatePayload)) });
  await invalidSourceTemplatePage.getByRole("button", { name: /^Explore/ }).click();
 const invalidTemplateNode = invalidSourceTemplatePage.locator(".topology-node-list button").first();
  await invalidTemplateNode.click();
  const invalidTemplateInspector = invalidSourceTemplatePage.locator("#source-inspector");
  await invalidTemplateInspector.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await invalidTemplateInspector.locator("a.source-open").count(), 0, "invalid source URL template produced an external link");
  assert.match(await invalidTemplateInspector.innerText(), /Repository link not configured|Repository link unavailable/, "invalid source URL template was not sanitized");
  await invalidSourceTemplatePage.close();

  const localBuildPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await localBuildPage.goto(`${base}/`, { waitUntil: "networkidle" });
  await localBuildPage.getByRole("textbox", { name: "Repository URL" }).fill("git@github.com:example/repository.git");
  await localBuildPage.getByRole("button", { name: "Build graph", exact: true }).click();
  const localFormError = localBuildPage.locator(".hosted-build-form-error");
  await localFormError.waitFor({ state: "visible", timeout: 10_000 });
  assert.match(await localFormError.innerText(), /full HTTPS|public HTTPS GitHub, GitLab, or Bitbucket/i, "invalid repository URL was not rejected locally");
  assert.equal(await localBuildPage.locator(".hosted-build-status").count(), 0, "invalid repository URL reached the build service");
  await localBuildPage.getByRole("textbox", { name: "Repository URL" }).fill("https://github.com/example/repository");
  await localBuildPage.getByRole("button", { name: "Build graph", exact: true }).click();
  const localBuildStatus = localBuildPage.locator(".hosted-build-status[role=alert]");
  await localBuildStatus.waitFor({ state: "visible", timeout: 10_000 });
  assert.match(
    await localBuildStatus.innerText(),
    /Hosted repository builds are not configured/i,
    "local hosted-build fallback did not explain the missing API configuration",
  );
  await localBuildPage.close();

  const hostedBundleId = process.env.LACHESIS_BUNDLE_ID;
  if (hostedBundleId) {
    for (const [path, expectedStatus] of [[`/api/bundles/${encodeURIComponent(hostedBundleId)}`, 200], ["/api/bundles/not-a-bundle", 400], ["/api/bundles/b_unknown1234", 404]]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, expectedStatus, `${path} returned an unexpected status`);
      assert.equal(response.headers.get("access-control-allow-origin"), "*", `${path} did not expose CORS for recovery`);
    }
    const options = await fetch(`${base}/api/bundles/${encodeURIComponent(hostedBundleId)}`, { method: "OPTIONS" });
    assert.equal(options.status, 204, "bundle OPTIONS preflight failed");
    assert.equal(options.headers.get("access-control-allow-origin"), "*", "bundle OPTIONS omitted CORS");
    const corsOrigin = process.env.CORS_TEST_ORIGIN;
    if (corsOrigin) {
      const corsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await corsPage.goto(`${corsOrigin.replace(/\/$/, '')}/`, { waitUntil: "domcontentloaded" });
      for (const [path, expectedStatus] of [[`/api/bundles/${encodeURIComponent(hostedBundleId)}`, 200], ["/api/bundles/not-a-bundle", 400], ["/api/bundles/b_unknown1234", 404]]) {
        const result = await corsPage.evaluate(async ({ apiOrigin, requestPath }) => {
          const response = await fetch(`${apiOrigin}${requestPath}`, { headers: { Accept: "application/json" } });
          return { status: response.status, body: await response.text() };
        }, { apiOrigin: base, requestPath: path });
        assert.equal(result.status, expectedStatus, `browser cross-origin ${path} returned an unexpected status`);
        assert.ok(result.body.length > 0, `browser cross-origin ${path} returned no readable body`);
      }
      await corsPage.close();
    }
    const hostedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const bundleRequests = [];
    hostedPage.on("request", (request) => {
      if (request.url().includes(`/api/bundles/${encodeURIComponent(hostedBundleId)}`)) bundleRequests.push(request.url());
    });
    await hostedPage.goto(`${base}/?bundle=${encodeURIComponent(hostedBundleId)}&map_mode=architecture&repository=demo%2Fatlas-commerce&revision=main&region=decode&label=Decode&anchor=DecodeEthernet%28%29&flow=packet-decode&step=ipv4&domain=memory-safety`, { waitUntil: "domcontentloaded" });
    await hostedPage.waitForFunction(() => document.body.innerText.includes("LOADED BUNDLE"), undefined, { timeout: 10_000 });
    assert.ok(bundleRequests.length > 0, "hosted deep link did not request its opaque bundle");
    assert.match(await hostedPage.locator("body").innerText(), /demo\/atlas-commerce/);
    const hostedAlerts = await hostedPage.locator('[role="alert"]').allTextContents();
    assert.ok(hostedAlerts.every((text) => !/could not|error|failed|invalid/i.test(text)), "hosted deep link rendered an error");
    const hostedUrl = new URL(hostedPage.url());
    assert.equal(hostedUrl.searchParams.get("bundle"), hostedBundleId);
    assert.equal(hostedUrl.searchParams.get("repository"), "demo/atlas-commerce");
    assert.equal(hostedUrl.searchParams.get("revision"), "main");
    assert.equal(hostedUrl.searchParams.get("region"), "decode");
    assert.equal(hostedUrl.searchParams.get("anchor"), "DecodeEthernet()");
    assert.equal(hostedUrl.searchParams.get("flow_context"), "packet-decode");
    assert.equal(hostedUrl.searchParams.get("step_context"), "ipv4");
    assert.equal(hostedUrl.searchParams.get("domain"), "memory-safety");
    assert.equal(hostedUrl.searchParams.get("view"), "map");
    assert.equal(await hostedPage.locator(".context-handoff-origin").textContent(), "／DESIGN MAP CONTEXT");
    assert.ok((await hostedPage.locator(".context-handoff-crumb").count()) >= 5, "handoff context was not visible");
    await hostedPage.close();
  }
  console.log("browser smoke test passed");
} finally {
  await browser.close();
}
