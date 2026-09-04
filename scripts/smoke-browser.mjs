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
  console.log("browser smoke test passed");
} finally {
  await browser.close();
}
