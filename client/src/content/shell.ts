/**
 * Static HTML shell used by scripts/prerender.ts.
 *
 * Lives under client/src so Tailwind's content scanner picks up the class
 * names used here and keeps them in the built stylesheet. Like
 * ./marketing.ts, it must stay import-free so `tsx` can run it directly.
 */

import {
  FOOTER_LINKS,
  ONE_LINER,
  renderPageHtml,
  type MarketingPage,
} from "./marketing";

const escAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Header bar: brand lockup plus links to every marketing page. */
export function renderHeaderHtml(currentPath: string): string {
  const links = FOOTER_LINKS.filter((l) => l.path !== "/privacy" && l.path !== "/terms")
    .map(
      (l) =>
        `<a href="${l.path}" class="whitespace-nowrap hover:text-foreground hover:underline${
          l.path === currentPath ? " text-foreground font-semibold" : ""
        }"${l.path === currentPath ? ' aria-current="page"' : ""}>${escAttr(l.label)}</a>`
    )
    .join("");

  return `<header class="border-b border-[hsl(var(--edition-border-hair))]">
  <div class="container mx-auto flex h-16 items-center gap-3 px-4">
    <a href="/" class="flex items-center gap-2">
      <img src="/logo-mark.svg" alt="NewsPlatform logo" width="28" height="28" class="h-7 w-7" />
      <span class="font-display text-xl font-bold">NewsPlatform</span>
    </a>
  </div>
  <nav aria-label="Primary" class="border-t border-[hsl(var(--edition-border-hair))] bg-[hsl(var(--edition-panel))]">
    <div class="container mx-auto flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm text-muted-foreground">${links}</div>
  </nav>
</header>`;
}

/** Footer: mirrors client/src/components/site-footer.tsx. */
export function renderFooterHtml(): string {
  const links = FOOTER_LINKS.map(
    (l) => `<a href="${l.path}" class="hover:text-foreground hover:underline">${escAttr(l.label)}</a>`
  ).join("");

  return `<footer class="mt-12 border-t border-[hsl(var(--edition-border-hair))]">
  <div class="container mx-auto px-4 py-8 lg:px-8">
    <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div class="max-w-md">
        <p class="font-display text-lg font-bold">NewsPlatform</p>
        <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">${escAttr(ONE_LINER)}</p>
      </div>
      <nav aria-label="Footer" class="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-3">${links}</nav>
    </div>
    <p class="mt-6 text-xs text-muted-foreground">© ${new Date().getFullYear()} NewsPlatform</p>
  </div>
</footer>`;
}

/** Full body content for a prerendered marketing page. */
export function renderShellHtml(page: MarketingPage): string {
  return `<div class="min-h-screen bg-background">${renderHeaderHtml(
    page.path
  )}<main class="container mx-auto max-w-3xl px-4 py-10">${renderPageHtml(
    page
  )}</main>${renderFooterHtml()}</div>`;
}
