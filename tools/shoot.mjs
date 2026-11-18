// Three screenshots of the dashboard, 1440x900 JPEG quality 90.
// Usage: node tools/shoot.mjs
//   1-board.jpg    the board, default view
//   2-detail.jpg   the detail dialog of the rank-1 protocol
//   3-filtered.jpg the board filtered to the Risk Curators category
//
// Serves the dashboard over a local file URL and screenshots it with
// headless Chromium (Playwright). No network: the page loads only local files.

import { chromium } from "../../../playwright-core/index.mjs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(REPO, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const data = JSON.parse(
  (await import("node:fs")).readFileSync(join(REPO, "out", "board.json"), "utf8"),
);
const top1 = data.rows[0].slug;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url = pathToFileURL(join(REPO, "dashboard", "index.html")).href;

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(600);
await page.evaluate(() => {
  document.querySelector(".board").scrollIntoView();
  window.scrollBy(0, -140);
});
await page.waitForTimeout(300);
writeFileSync(join(SHOTS, "1-board.jpg"), await page.screenshot({ type: "jpeg", quality: 90 }));

await page.evaluate((slug) => { location.hash = "#p=" + slug; }, top1);
await page.waitForTimeout(600);
writeFileSync(join(SHOTS, "2-detail.jpg"), await page.screenshot({ type: "jpeg", quality: 90 }));

await page.evaluate(() => { document.querySelector("#dlg").close(); location.hash = "#category=Risk Curators"; });
await page.waitForTimeout(600);
await page.evaluate(() => {
  document.querySelector(".board").scrollIntoView();
  window.scrollBy(0, -140);
});
await page.waitForTimeout(300);
writeFileSync(join(SHOTS, "3-filtered.jpg"), await page.screenshot({ type: "jpeg", quality: 90 }));

await browser.close();
for (const f of ["1-board.jpg", "2-detail.jpg", "3-filtered.jpg"]) {
  const st = (await import("node:fs")).statSync(join(SHOTS, f));
  console.log(f, `${(st.size / 1024).toFixed(0)} KiB`);
}
console.log("screenshots done — re-run main.ts so the dossier includes them.");
