import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "Lachesis — Deterministic code graph reader");
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(dimensions.scrollWidth, dimensions.width, `horizontal overflow at ${viewport.width}px`);
    assert.equal(await page.locator('meta[name="generator"]').count(), 0, "framework metadata is exposed");
    assert.equal(await page.locator('script[src*="_vercel/insights"]').count(), 0, "analytics loaded outside Vercel");
    assert.deepEqual(errors, [], `browser errors at ${viewport.width}px`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/?view=map&map_mode=map`, { waitUntil: "networkidle" });
  const nodes = page.locator(".topology-node-list button");
  assert.ok(await nodes.count() > 0, "graph node list is empty");
  await nodes.first().click();
  assert.equal(await page.locator("#source-inspector").count(), 1, "node selection did not open inspector");
  for (const [label, view] of [["Trace", "trace"], ["Compare", "compare"], ["Understand", "home"]]) {
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
    assert.equal(new URL(page.url()).searchParams.get("view"), view, `${label} navigation failed`);
  }
  await page.close();

  const hostedBundleId = process.env.LACHESIS_BUNDLE_ID;
  if (hostedBundleId) {
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
