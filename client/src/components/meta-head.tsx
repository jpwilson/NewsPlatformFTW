import { Helmet } from "react-helmet-async";
import { SITE_URL } from "@/content/marketing";

interface MetaHeadProps {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  type?: string;
  /** Canonical path or absolute URL; defaults to `url` on the production host. */
  canonical?: string;
  /** Structured data (e.g. NewsArticle), emitted as application/ld+json. */
  jsonLd?: Record<string, unknown>;
}

const absolute = (pathOrUrl: string) =>
  /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

export function MetaHead({
  title,
  description,
  imageUrl,
  url,
  type = "article",
  canonical,
  jsonLd,
}: MetaHeadProps) {
  // Shared links and search engines should always point at the production host.
  const fullUrl = absolute(url);
  const fullImageUrl = imageUrl ? absolute(imageUrl) : undefined;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={absolute(canonical || url)} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="NewsPlatform" />
      {fullImageUrl && <meta property="og:image" content={fullImageUrl} />}

      {/* Twitter Card Tags */}
      <meta
        name="twitter:card"
        content={fullImageUrl ? "summary_large_image" : "summary"}
      />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {fullImageUrl && <meta name="twitter:image" content={fullImageUrl} />}

      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
