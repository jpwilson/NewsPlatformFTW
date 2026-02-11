import React from "react";
import { AdminArticleTable } from "@/components/admin-article-table";
import { AdminChannelTable } from "@/components/admin-channel-table";
import { Link } from "wouter";
import { Newspaper, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

function ApiKeySection() {
  const [keys, setKeys] = React.useState<any[]>([]);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/v1/api-keys", { credentials: "include" });
      if (res.ok) setKeys(await res.json());
    } catch {}
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.key);
        setNewKeyName("");
        fetchKeys();
      }
    } catch {}
    setLoading(false);
  }

  async function revokeKey(id: string) {
    try {
      await fetch(`/api/v1/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchKeys();
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Generate API Key</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Claude Cowork)"
            className="flex-1 px-3 py-2 border rounded-md bg-background text-sm"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
          />
          <Button onClick={createKey} disabled={loading || !newKeyName.trim()} size="sm">
            {loading ? "Creating..." : "Generate Key"}
          </Button>
        </div>
        {createdKey && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
              API Key created! Copy it now — it won't be shown again:
            </p>
            <code className="text-xs break-all bg-green-100 dark:bg-green-900 p-2 rounded block">
              {createdKey}
            </code>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Your API Keys</h3>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {keys.map((k: any) => (
              <div key={k.id} className="flex items-center justify-between p-3">
                <div>
                  <span className="font-medium text-sm">{k.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({k.prefix}...)</span>
                  {k.isRevoked && (
                    <span className="ml-2 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">
                      Revoked
                    </span>
                  )}
                </div>
                {!k.isRevoked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 text-xs"
                    onClick={() => revokeKey(k.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2">
        <Link href="/api">
          <Button variant="outline" size="sm" className="gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            API Documentation & How To Guide
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      {/* Simple admin header with just the logo */}
      <header className="border-b sticky top-0 z-50 bg-background">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <Newspaper className="h-6 w-6" />
            <span className="font-bold text-lg">NewsPlatform</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

        <Tabs defaultValue="articles" className="mt-8">
          <TabsList className="mb-6">
            <TabsTrigger value="articles">Manage Articles</TabsTrigger>
            <TabsTrigger value="channels">Manage Channels</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
          </TabsList>

          <TabsContent value="articles">
            <section>
              <h2 className="text-2xl font-semibold mb-4">
                Article Management
              </h2>
              <p className="text-muted-foreground mb-4">
                Edit article engagement metrics (views, likes, dislikes)
              </p>
              <AdminArticleTable />
            </section>
          </TabsContent>

          <TabsContent value="channels">
            <section>
              <h2 className="text-2xl font-semibold mb-4">
                Channel Management
              </h2>
              <p className="text-muted-foreground mb-4">
                Edit channel subscriber counts to boost visibility
              </p>
              <AdminChannelTable />
            </section>
          </TabsContent>

          <TabsContent value="api">
            <section>
              <h2 className="text-2xl font-semibold mb-4">
                Content API
              </h2>
              <p className="text-muted-foreground mb-4">
                Generate API keys and manage programmatic access to create articles
              </p>
              <ApiKeySection />
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
