// Screenshots for token-radar-01: three 1440x900 JPEG (quality 80) captures
// of the built dashboard, taken with Playwright Chromium.
//
//   node tools/shoot.mjs [outDir] [destDir]
//
// outDir holds the dashboard built by main.ts (default "out"); destDir is
// where the JPGs land (default "screenshots", the repository folder main.ts
// copies into the next build). Run main.ts again after shooting so the
// dossier is rebuilt from the new screenshots.
//
//   1-board.jpg    — the board, default view, scrolled to the table
//   2-detail.jpg   — the detail dialog for Steakhouse Financial
//   3-filtered.jpg — the board filtered to the Risk Curators category

import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { chromium } from "/home/hatch/workspace/makefun/playwright-core/index.mjs";

const outDir = resolve(process.argv[2] ?? "out");
const destDir = resolve(process.argv[3] ?? "screenshots");
const pageUrl = "file://" + join(outDir, "dashboard", "index.html");

function chromiumPath() {
  const base = join(homedir(), ".cache", "ms-playwright");
  for (const d of readdirSync(base)) {
    if (!d.startsWith("chromium-")) continue;
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const exe = join(base, d, sub);
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error("no Chromium executable under " + base);
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--no-sandbox"],
});

async function shot(name, url, scrollTo) {
  // A fresh page per shot: navigating to the same file URL with only the
  // hash changed is a same-document navigation and would not re-run the app.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("#boardBody tr", { timeout: 15000 });
  if (scrollTo) {
    await page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ block: "start" });
      window.scrollBy(0, -10);
    }, scrollTo);
    await page.waitForTimeout(300);
  } else {
    await page.waitForTimeout(400);
  }
  const file = join(destDir, name);
  await page.screenshot({ path: file, type: "jpeg", quality: 80 });
  console.log("wrote", file);
  await page.close();
}

await shot("1-board.jpg", pageUrl, "#controls");
await shot("2-detail.jpg", pageUrl + "#p=steakhouse-financial", null);
await shot("3-filtered.jpg", pageUrl + "#category=Risk+Curators", "#controls");

await browser.close();
console.log("done");
