import React from "react";
import { AdminArticleTable } from "@/components/admin-article-table";
import { AdminChannelTable } from "@/components/admin-channel-table";
import { Link } from "wouter";
import { Newspaper, ExternalLink, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export function ApiKeySection() {
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

function ApiAccessManager() {
  const [users, setUsers] = React.useState<any[]>([]);
  const [username, setUsername] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await apiRequest("GET", "/api/v1/api-access-users");
      if (res.ok) setUsers(await res.json());
    } catch {}
  }

  async function grantAccess() {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest("POST", "/api/v1/api-access-users", { username: username.trim() });
      if (res.ok) {
        const data = await res.json();
        setSuccess(`Granted API access to ${data.username}`);
        setUsername("");
        fetchUsers();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to grant access");
      }
    } catch (e: any) {
      setError(e.message || "Failed to grant access");
    }
    setLoading(false);
  }

  async function revokeAccess(supabaseUid: string, name: string) {
    try {
      await apiRequest("DELETE", `/api/v1/api-access-users/${supabaseUid}`);
      setSuccess(`Revoked API access for ${name}`);
      fetchUsers();
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Grant API Access</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Allow a user to generate their own API keys for programmatic article creation
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            className="flex-1 px-3 py-2 border rounded-md bg-background text-sm"
            onKeyDown={(e) => e.key === "Enter" && grantAccess()}
          />
          <Button onClick={grantAccess} disabled={loading || !username.trim()} size="sm">
            {loading ? "Granting..." : "Grant Access"}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {success && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">{success}</p>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Users with API Access</h3>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users have been granted API access yet.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {users.map((u: any) => (
              <div key={u.supabaseUid} className="flex items-center justify-between p-3">
                <div>
                  <span className="font-medium text-sm">{u.username}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    Granted {new Date(u.grantedAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 text-xs"
                  onClick={() => revokeAccess(u.supabaseUid, u.username)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      {/* Simple admin header with just the logo */}
      <header className="sticky top-0 z-50 glass-nav">
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
            <section className="space-y-10">
              <div>
                <h2 className="text-2xl font-semibold mb-4">
                  Content API
                </h2>
                <p className="text-muted-foreground mb-4">
                  Generate API keys and manage programmatic access to create articles
                </p>
                <ApiKeySection />
              </div>

              <div className="border-t pt-8">
                <h2 className="text-2xl font-semibold mb-4">
                  Manage API Access
                </h2>
                <p className="text-muted-foreground mb-4">
                  Grant or revoke API key generation access for other users
                </p>
                <ApiAccessManager />
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
