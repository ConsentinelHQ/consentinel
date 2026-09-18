import { chromium } from "playwright";

const url = process.argv[2] ?? "https://mizzenandmain.com";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(3000);

const controls = await page.evaluate(() =>
  [...document.querySelectorAll("#onetrust-banner-sdk button, #onetrust-banner-sdk a")].map(
    (e) => ({
      id: e.id,
      cls: (e as HTMLElement).className,
      text: (e.textContent ?? "").trim().slice(0, 40),
    }),
  ),
);
console.log(JSON.stringify(controls, null, 2));
await browser.close();
process.exit(0);
