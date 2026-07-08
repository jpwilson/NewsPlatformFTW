import { Link } from "wouter";
import { ApiKeySection } from "@/pages/admin-page";

export default function ApiKeysPage() {
  return (
    <>
      <header className="sticky top-0 z-50 glass-nav">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center cursor-pointer" aria-label="NewsPlatform home">
            <img src="/logo-newsplatform.svg" alt="NewsPlatform" className="h-8 w-auto dark:hidden" />
            <img src="/logo-newsplatform-white.svg" alt="NewsPlatform" className="hidden h-8 w-auto dark:block" />
          </Link>
        </div>
      </header>

      <div className="container mx-auto py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">API Keys</h1>
        <p className="text-muted-foreground mb-6">
          Generate API keys to programmatically create articles via the Content API
        </p>
        <ApiKeySection />
      </div>
    </>
  );
}
