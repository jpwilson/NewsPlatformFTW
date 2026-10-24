/**
 * Genuine 404 for URLs that are neither a file in dist/public nor one of the
 * app routes in shared/spa-routes.js (the vercel.json catch-all points here).
 *
 * Previously every unknown URL was rewritten to the SPA shell with HTTP 200,
 * which makes a soft 404: search engines index the shell, and AI crawlers that
 * do not run JavaScript get an empty page for a URL that does not exist.
 *
 * Self-contained on purpose — serverless functions do not get the static
 * build output on disk.
 */

const LINKS = [
  ["/", "Home"],
  ["/about", "About NewsPlatform"],
  ["/channels", "Channel directory"],
  ["/faq", "FAQ"],
  ["/for-writers", "For writers"],
];

export function notFoundHtml(pathname = "") {
  const safePath = String(pathname)
    .slice(0, 120)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page not found — NewsPlatform</title>
    <meta name="description" content="That page does not exist on NewsPlatform. Browse the front page, the channel directory, or find out what NewsPlatform is." />
    <meta name="robots" content="noindex, follow" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff;
             max-width: 40rem; margin: 0 auto; padding: 4rem 1.25rem; line-height: 1.6; }
      h1 { font-size: 2rem; margin: 0 0 .5rem; }
      p { color: #444; }
      code { background: #f4f4f5; padding: .1rem .3rem; border-radius: 3px; font-size: .9em; }
      ul { padding-left: 1.1rem; }
      li { margin: .35rem 0; }
      a { color: #b91c1c; }
    </style>
  </head>
  <body>
    <h1>Page not found</h1>
    <p>There is nothing at <code>${safePath || "this address"}</code> on NewsPlatform.</p>
    <ul>
      ${LINKS.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("\n      ")}
    </ul>
  </body>
</html>
`;
}

export default function handler(req, res) {
  let pathname = "";
  try {
    pathname = new URL(req.url || "/", `https://${req.headers?.host || "localhost"}`).pathname;
  } catch {
    pathname = "";
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("X-Robots-Tag", "noindex");
  return res.status(404).send(notFoundHtml(pathname));
}
