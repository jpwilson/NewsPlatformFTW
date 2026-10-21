import { Helmet } from "react-helmet-async";
import {
  SITE_URL,
  pageJsonLd,
  type MarketingPage,
} from "@/content/marketing";

/**
 * Head tags for a prerendered marketing page.
 *
 * scripts/prerender.ts writes the identical tags into the static HTML with
 * `data-rh="true"`, so react-helmet-async takes ownership of them on mount
 * instead of leaving duplicates behind.
 */
export function SeoHead({ page }: { page: MarketingPage }) {
  const url = `${SITE_URL}${page.path === "/" ? "/" : page.path}`;
  const image = `${SITE_URL}/logo-stacked.png`;

  return (
    <Helmet>
      <title>{page.title}</title>
      <meta name="description" content={page.description} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="NewsPlatform" />
      <meta property="og:title" content={page.title} />
      <meta property="og:description" content={page.description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={page.title} />
      <meta name="twitter:description" content={page.description} />
      <meta name="twitter:image" content={image} />

      <script type="application/ld+json">{JSON.stringify(pageJsonLd(page))}</script>
    </Helmet>
  );
}
