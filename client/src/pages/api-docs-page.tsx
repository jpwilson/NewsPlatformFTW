import { NavigationBar } from "@/components/navigation-bar";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ChevronDown, ChevronRight, Key, BookOpen, Zap, Code2, Shield } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function EndpointSection({
  method,
  path,
  description,
  auth,
  children,
  defaultOpen = false,
}: {
  method: string;
  path: string;
  description: string;
  auth: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const methodColors: Record<string, string> = {
    GET: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    POST: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${methodColors[method] || "bg-gray-100"}`}>
          {method}
        </span>
        <code className="text-sm font-mono">{path}</code>
        <span className="text-sm text-muted-foreground ml-auto hidden sm:block">{description}</span>
      </button>
      {open && (
        <div className="border-t p-4 space-y-4 bg-muted/20">
          <p className="text-sm text-muted-foreground sm:hidden">{description}</p>
          <div className="flex items-center gap-2 text-xs">
            <Shield className="h-3.5 w-3.5" />
            <span className="text-muted-foreground">Auth:</span>
            <span className="font-medium">{auth}</span>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  const baseUrl = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `https://${window.location.hostname}`
    : "https://newsplatform.org";

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Content API</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Programmatically create and manage articles on NewsPlatform. Build integrations, automate publishing, or connect AI tools to generate content at scale.
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Quick Start
          </h2>
          <div className="space-y-4">
            <div className="border rounded-lg p-5 space-y-3">
              <h3 className="font-semibold">1. Generate an API Key</h3>
              <p className="text-sm text-muted-foreground">
                Generate a key from your profile or by calling the API key endpoint with your session token. The key is shown once at creation — store it securely.
              </p>
              <CodeBlock code={`curl -X POST ${baseUrl}/api/v1/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My Integration"}'`} />
            </div>

            <div className="border rounded-lg p-5 space-y-3">
              <h3 className="font-semibold">2. List Your Channels</h3>
              <p className="text-sm text-muted-foreground">
                Find which channels you can publish to.
              </p>
              <CodeBlock code={`curl ${baseUrl}/api/v1/content/channels \\
  -H "X-API-Key: nk_your_api_key_here"`} />
            </div>

            <div className="border rounded-lg p-5 space-y-3">
              <h3 className="font-semibold">3. Create an Article</h3>
              <p className="text-sm text-muted-foreground">
                Publish an article using markdown. It will be converted to rich HTML automatically.
              </p>
              <CodeBlock code={`curl -X POST ${baseUrl}/api/v1/content/articles \\
  -H "X-API-Key: nk_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Breaking: Major Discovery in AI Research",
    "content": "# AI Breakthrough\\n\\nResearchers have announced a **major** discovery...\\n\\n## Key Findings\\n\\n- Finding one\\n- Finding two\\n- Finding three\\n\\n> This changes everything. — Lead Researcher",
    "contentFormat": "markdown",
    "channelId": 1,
    "categoryIds": [3],
    "published": true
  }'`} />
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Key className="h-5 w-5" />
            Authentication
          </h2>
          <div className="border rounded-lg p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              All Content API endpoints support two authentication methods:
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm">API Key (Recommended for scripts)</h4>
                <p className="text-xs text-muted-foreground">Pass your key in the X-API-Key header.</p>
                <CodeBlock code={`X-API-Key: nk_your_key_here`} />
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm">Bearer Token (JWT)</h4>
                <p className="text-xs text-muted-foreground">Use a Supabase JWT access token.</p>
                <CodeBlock code={`Authorization: Bearer eyJhbG...`} />
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="font-medium mb-1">Permissions</p>
              <p className="text-muted-foreground">
                An API key authenticates as the user who created it. You can only create articles in channels you own. Keys are stored as SHA-256 hashes and can be revoked at any time.
              </p>
            </div>
          </div>
        </section>

        {/* API Key Management */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key Management
          </h2>
          <div className="space-y-3">
            <EndpointSection
              method="POST"
              path="/api/v1/api-keys"
              description="Generate a new API key"
              auth="Bearer JWT only"
            >
              <div>
                <h4 className="text-sm font-semibold mb-2">Request Body</h4>
                <CodeBlock language="json" code={`{
  "name": "My Bot",           // Required - descriptive name
  "expiresInDays": 365        // Optional - days until expiry (null = never)
}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (201)</h4>
                <CodeBlock language="json" code={`{
  "id": "uuid",
  "key": "nk_abc123...",      // Only shown once!
  "prefix": "nk_abc123",
  "name": "My Bot",
  "createdAt": "2026-02-10T...",
  "expiresAt": "2027-02-10T..."
}`} />
              </div>
            </EndpointSection>

            <EndpointSection
              method="GET"
              path="/api/v1/api-keys"
              description="List your API keys"
              auth="Bearer JWT only"
            >
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (200)</h4>
                <CodeBlock language="json" code={`[
  {
    "id": "uuid",
    "prefix": "nk_abc123",
    "name": "My Bot",
    "createdAt": "2026-02-10T...",
    "lastUsedAt": "2026-02-10T...",
    "expiresAt": null,
    "isRevoked": false
  }
]`} />
              </div>
            </EndpointSection>

            <EndpointSection
              method="DELETE"
              path="/api/v1/api-keys/:id"
              description="Revoke an API key"
              auth="Bearer JWT only"
            >
              <p className="text-sm text-muted-foreground">Immediately revokes the key. Any requests using it will return 401.</p>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (200)</h4>
                <CodeBlock language="json" code={`{ "message": "API key revoked" }`} />
              </div>
            </EndpointSection>
          </div>
        </section>

        {/* Content API */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Content Endpoints
          </h2>
          <div className="space-y-3">
            {/* Create Article */}
            <EndpointSection
              method="POST"
              path="/api/v1/content/articles"
              description="Create a single article"
              auth="API Key or Bearer JWT"
              defaultOpen={true}
            >
              <div>
                <h4 className="text-sm font-semibold mb-2">Request Body</h4>
                <CodeBlock language="json" code={`{
  "title": "Article Title",                    // Required
  "content": "# Markdown content here...",     // Required
  "contentFormat": "markdown",                 // "markdown" (default) or "html"
  "channelId": 5,                              // Required - must own this channel
  "categoryIds": [3, 12],                      // Optional - up to 3 category IDs
  "location": "New York",                      // Optional
  "locationLat": 40.7128,                      // Optional
  "locationLng": -74.0060,                     // Optional
  "published": true,                           // Optional (default: true)
  "images": [                                  // Optional - external image URLs
    {
      "url": "https://example.com/photo.jpg",
      "caption": "Photo description",
      "order": 0
    }
  ]
}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (201)</h4>
                <CodeBlock language="json" code={`{
  "id": 456,
  "title": "Article Title",
  "slug": "2026-02-10-article-title",
  "channelId": 5,
  "status": "published",
  "published": true,
  "createdAt": "2026-02-10T...",
  "url": "/articles/456/2026-02-10-article-title",
  "images": [...],
  "categories": [3, 12]
}`} />
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">Notes:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Markdown is converted to HTML that matches the web editor output</li>
                  <li>External image URLs are downloaded and stored on our servers</li>
                  <li>Duplicate detection: same title + channel within 24h returns 409</li>
                  <li>Slugs are auto-generated with date prefix and collision handling</li>
                </ul>
              </div>
            </EndpointSection>

            {/* Batch Create */}
            <EndpointSection
              method="POST"
              path="/api/v1/content/articles/batch"
              description="Create multiple articles"
              auth="API Key or Bearer JWT"
            >
              <div>
                <h4 className="text-sm font-semibold mb-2">Request Body</h4>
                <CodeBlock language="json" code={`{
  "articles": [
    {
      "title": "First Article",
      "content": "# Content...",
      "contentFormat": "markdown",
      "channelId": 5,
      "categoryIds": [3],
      "published": true
    },
    {
      "title": "Second Article",
      "content": "# More content...",
      "contentFormat": "markdown",
      "channelId": 5,
      "categoryIds": [4]
    }
  ]
}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (201)</h4>
                <CodeBlock language="json" code={`{
  "created": [
    { "index": 0, "id": 456, "title": "First Article", "slug": "..." }
  ],
  "failed": [
    { "index": 1, "title": "Second Article", "error": "Channel not found" }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}`} />
              </div>
              <p className="text-sm text-muted-foreground">Maximum 10 articles per batch. Partial failures do not roll back successful creates.</p>
            </EndpointSection>

            {/* Get Article */}
            <EndpointSection
              method="GET"
              path="/api/v1/content/articles/:id"
              description="Get article details"
              auth="API Key or Bearer JWT"
            >
              <p className="text-sm text-muted-foreground">
                Accepts a numeric article ID or slug. Returns full article details including images and categories. Only returns articles you own.
              </p>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (200)</h4>
                <CodeBlock language="json" code={`{
  "id": 456,
  "title": "Article Title",
  "slug": "2026-02-10-article-title",
  "channelId": 5,
  "channelName": "Tech News",
  "status": "published",
  "published": true,
  "createdAt": "2026-02-10T...",
  "viewCount": 150,
  "url": "/articles/456/2026-02-10-article-title",
  "images": [...],
  "categories": [...]
}`} />
              </div>
            </EndpointSection>

            {/* List Channels */}
            <EndpointSection
              method="GET"
              path="/api/v1/content/channels"
              description="List your channels"
              auth="API Key or Bearer JWT"
            >
              <p className="text-sm text-muted-foreground">
                Returns all channels owned by the authenticated user, with article and subscriber counts.
              </p>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (200)</h4>
                <CodeBlock language="json" code={`[
  {
    "id": 5,
    "name": "Tech News",
    "slug": "tech-news",
    "description": "Daily technology updates",
    "category": "Technology",
    "articleCount": 42,
    "subscriberCount": 1234
  }
]`} />
              </div>
            </EndpointSection>

            {/* List Categories */}
            <EndpointSection
              method="GET"
              path="/api/v1/content/categories"
              description="List all categories"
              auth="API Key or Bearer JWT"
            >
              <p className="text-sm text-muted-foreground">
                Returns the full category hierarchy. Use category IDs when creating articles.
              </p>
              <div>
                <h4 className="text-sm font-semibold mb-2">Response (200)</h4>
                <CodeBlock language="json" code={`[
  {
    "id": 3,
    "name": "Technology",
    "parent_id": null,
    "children": [
      { "id": 45, "name": "Artificial Intelligence", "parent_id": 3, "children": [] },
      { "id": 46, "name": "Cybersecurity", "parent_id": 3, "children": [] }
    ]
  }
]`} />
              </div>
            </EndpointSection>
          </div>
        </section>

        {/* Error Codes */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">Error Codes</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="text-left p-3 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="p-3 font-mono">400</td><td className="p-3 text-muted-foreground">Bad Request — missing or invalid fields</td></tr>
                <tr><td className="p-3 font-mono">401</td><td className="p-3 text-muted-foreground">Unauthorized — invalid or missing API key / token</td></tr>
                <tr><td className="p-3 font-mono">403</td><td className="p-3 text-muted-foreground">Forbidden — you don't own this channel or article</td></tr>
                <tr><td className="p-3 font-mono">404</td><td className="p-3 text-muted-foreground">Not Found — channel or article doesn't exist</td></tr>
                <tr><td className="p-3 font-mono">409</td><td className="p-3 text-muted-foreground">Conflict — duplicate article (same title + channel within 24h)</td></tr>
                <tr><td className="p-3 font-mono">500</td><td className="p-3 text-muted-foreground">Server Error — something went wrong on our end</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Content Format */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">Content Format</h2>
          <div className="border rounded-lg p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              The API accepts content in <strong>Markdown</strong> or <strong>HTML</strong>. Markdown is recommended — it's easier to generate and is automatically converted to the same HTML format used by our web editor.
            </p>
            <div>
              <h4 className="text-sm font-semibold mb-2">Supported Markdown Features</h4>
              <div className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
                <div className="space-y-1">
                  <p><code className="bg-muted px-1 rounded"># ## ###</code> Headings (H1-H3)</p>
                  <p><code className="bg-muted px-1 rounded">**bold**</code> Bold text</p>
                  <p><code className="bg-muted px-1 rounded">*italic*</code> Italic text</p>
                  <p><code className="bg-muted px-1 rounded">- item</code> Bullet lists</p>
                  <p><code className="bg-muted px-1 rounded">1. item</code> Numbered lists</p>
                </div>
                <div className="space-y-1">
                  <p><code className="bg-muted px-1 rounded">[text](url)</code> Links</p>
                  <p><code className="bg-muted px-1 rounded">&gt; quote</code> Blockquotes</p>
                  <p><code className="bg-muted px-1 rounded">```code```</code> Code blocks</p>
                  <p><code className="bg-muted px-1 rounded">---</code> Horizontal rules</p>
                  <p><code className="bg-muted px-1 rounded">`inline`</code> Inline code</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Rate Limits */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">Limits</h2>
          <div className="border rounded-lg p-5">
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="font-semibold mb-1">Batch size</p>
                <p className="text-muted-foreground">Max 10 articles per batch request</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Images</p>
                <p className="text-muted-foreground">Max 5 images per article, 10MB each</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Categories</p>
                <p className="text-muted-foreground">Max 3 categories per article</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Deduplication</p>
                <p className="text-muted-foreground">Same title + channel blocked for 24 hours</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-center text-sm text-muted-foreground py-8 border-t">
          <p>Need help? Contact the NewsPlatform team.</p>
        </footer>
      </div>
    </div>
  );
}
