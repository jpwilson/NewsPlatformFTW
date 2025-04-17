import { Helmet } from "react-helmet-async";

interface MetaHeadProps {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  type?: string;
}

export function MetaHead({
  title,
  description,
  imageUrl,
  url,
  type = "article",
}: MetaHeadProps) {
  // Get domain for absolute URLs
  const domain = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${domain}${url}`;
  const fullImageUrl =
    imageUrl && !imageUrl.startsWith("http")
      ? `${domain}${imageUrl}`
      : imageUrl;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="News Platform" />
      {fullImageUrl && <meta property="og:image" content={fullImageUrl} />}

      {/* Twitter Card Tags */}
      <meta
        name="twitter:card"
        content={fullImageUrl ? "summary_large_image" : "summary"}
      />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {fullImageUrl && <meta name="twitter:image" content={fullImageUrl} />}
    </Helmet>
  );
}
