import { FOOTER_LINKS, ONE_LINER } from "@/content/marketing";

/**
 * Site footer with links to every public page. Rendered identically by
 * scripts/prerender.ts (see renderFooterHtml there) so crawlers see the same
 * internal link graph as people do.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-[hsl(var(--edition-border-hair))]">
      <div className="container mx-auto px-4 py-8 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="font-display text-lg font-bold">NewsPlatform</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {ONE_LINER}
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-3"
          >
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.path}
                href={link.path}
                className="hover:text-foreground hover:underline"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} NewsPlatform
        </p>
      </div>
    </footer>
  );
}
