/**
 * IndexNow: tell Bing (which feeds Copilot, DuckDuckGo and ChatGPT search),
 * Yandex, Seznam and Naver that a URL changed, so they recrawl it in minutes
 * instead of days.
 *
 * - Production only (VERCEL_ENV === "production"): previews, local runs and
 *   tests never ping.
 * - Never throws, and never holds a request for more than `timeoutMs`
 *   (2 seconds by default).
 * - The key is the file committed at client/public/<key>.txt (served at the
 *   site root); scripts/check-seo.mjs asserts INDEXNOW_KEY matches it.
 *
 * Plain ESM, no npm imports.
 */

export const INDEXNOW_KEY = "7943e3bc64637f01d2f7ccf9eef61dc3";
export const INDEXNOW_HOST = "www.newsplatform.org";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const ORIGIN = `https://${INDEXNOW_HOST}`;

/**
 * Submit URLs on the production host. Resolves to what happened; never rejects.
 * @param {string[]} urls absolute URLs; anything not on https://www.newsplatform.org is dropped
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ sent: boolean, status?: number, reason?: string, urls?: string[] }>}
 */
export async function pingIndexNow(urls, { env = process.env, fetchImpl, timeoutMs = 2000 } = {}) {
  try {
    if (!env || env.VERCEL_ENV !== "production") return { sent: false, reason: "not_production" };
    const list = [
      ...new Set((Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && u.startsWith(`${ORIGIN}/`))),
    ].slice(0, 10000);
    if (list.length === 0) return { sent: false, reason: "no_urls" };

    const doFetch = fetchImpl || globalThis.fetch;
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ sent: false, reason: "timeout", urls: list });
      }, timeoutMs);
    });
    const request = Promise.resolve()
      .then(() =>
        doFetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host: INDEXNOW_HOST,
            key: INDEXNOW_KEY,
            keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
            urlList: list,
          }),
          signal: controller.signal,
        })
      )
      .then((res) => {
        // 200 accepted, 202 accepted (key not yet verified); anything else is
        // logged and ignored.
        if (res.status !== 200 && res.status !== 202) console.warn(`IndexNow: HTTP ${res.status}`);
        return { sent: true, status: res.status, urls: list };
      })
      .catch((err) => {
        console.warn("IndexNow: request failed:", err && err.message);
        return { sent: false, reason: "error", urls: list };
      });
    const result = await Promise.race([request, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    return { sent: false, reason: "error" };
  }
}
