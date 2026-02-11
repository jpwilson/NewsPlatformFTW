import { Link } from "wouter";
import { Newspaper } from "lucide-react";
import { ApiKeySection } from "@/pages/admin-page";

export default function ApiKeysPage() {
  return (
    <>
      <header className="sticky top-0 z-50 glass-nav">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <Newspaper className="h-6 w-6" />
            <span className="font-bold text-lg">NewsPlatform</span>
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
