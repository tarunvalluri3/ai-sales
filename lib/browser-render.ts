import "server-only";
import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { AppError } from "@/lib/errors";

/**
 * Headless-rendering fallback for `lib/url-ingestion.ts`'s `fetchUrlContent()`,
 * used only when a plain fetch() (which cannot execute JavaScript) returns too
 * little text -- a client-rendered page (React/Vue/etc. with no server-side
 * rendering) whose real content only exists after the browser runs its script
 * bundle. Confirmed live against a real such page (waveswebstudio.in): the raw
 * HTML is just `<div id="root"></div>` plus a `<script>` tag.
 *
 * `@sparticuz/chromium-min`'s binary is Linux-only (built for serverless
 * platforms) and does not include the Chromium binary itself -- it fetches a
 * pre-built pack from a remote URL on cold start. Pinned to the exact
 * installed npm package version (149.0.0): this package does not follow
 * semantic versioning and can have breaking changes at the patch level (its
 * own README), so the pinned pack must match the installed version exactly.
 */
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const RENDER_TIMEOUT_MS = 45_000;

/**
 * Local development only. `@sparticuz/chromium-min`'s binary only runs on
 * Linux, so a developer on Windows/macOS points this at their own installed
 * Chrome/Edge/Chromium to exercise this code path locally -- documented in
 * `.env.example`. Unset in production; the deployed Vercel function (Linux)
 * always uses the remote chromium-min pack instead.
 */
function getLocalExecutablePath(): string | undefined {
  return process.env.LOCAL_CHROMIUM_PATH;
}

async function launchBrowser(): Promise<Browser> {
  const localPath = getLocalExecutablePath();

  if (localPath) {
    return puppeteer.launch({ executablePath: localPath, headless: true });
  }

  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: "shell",
  });
}

/**
 * Renders `url` in a headless browser and returns the page's visible text
 * (`document.body.innerText`, which naturally excludes script/style content
 * and mirrors what a real visitor sees) once the page has finished loading.
 * Bounded to `RENDER_TIMEOUT_MS`, well under the caller's route/page
 * `maxDuration`, so a hung render fails with a clear `AppError` instead of
 * the platform killing the whole function abruptly. Always closes the
 * browser, even on failure.
 */
export async function renderPageText(url: string): Promise<string> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    throw new AppError(
      "Could not start the page renderer for this URL. Please try again, or paste the content in manually.",
      "renderPageText: browser launch failed",
      error,
    );
  }

  try {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
      const text = await page.evaluate(() => document.body.innerText);
      return text.trim();
    } finally {
      await page.close();
    }
  } catch (error) {
    throw new AppError(
      "This page took too long to load, or couldn't be rendered. Please try again, or paste the content in manually.",
      "renderPageText: page render failed",
      error,
    );
  } finally {
    await browser.close();
  }
}
