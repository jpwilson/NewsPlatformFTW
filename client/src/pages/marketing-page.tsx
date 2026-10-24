import { NavigationBar } from "@/components/navigation-bar";
import { SiteFooter } from "@/components/site-footer";
import { SeoHead } from "@/components/seo-head";
import { PAGES_BY_PATH, renderPageHtml, type MarketingPage } from "@/content/marketing";

/**
 * Renders one of the static marketing pages (/about, /faq, /compare/*, …).
 *
 * The body HTML comes from the same `renderPageHtml` used by
 * scripts/prerender.ts at build time, so the React render and the prerendered
 * static file are byte-identical in the content area.
 */
export function MarketingPageView({ page }: { page: MarketingPage }) {
  return (
    <div className="min-h-screen bg-background">
      <SeoHead page={page} />
      <NavigationBar />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div dangerouslySetInnerHTML={{ __html: renderPageHtml(page) }} />
      </div>
      <SiteFooter />
    </div>
  );
}

/** Route factory: `<Route path="/faq" component={marketingRoute("/faq")} />` */
export function marketingRoute(path: string) {
  const page = PAGES_BY_PATH[path];
  if (!page) throw new Error(`No marketing page defined for ${path}`);
  return function MarketingRoute() {
    return <MarketingPageView page={page} />;
  };
}
