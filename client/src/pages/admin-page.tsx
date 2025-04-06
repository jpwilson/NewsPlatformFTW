import React from "react";
import { AdminArticleTable } from "@/components/admin-article-table";

export default function AdminPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Manage Articles</h2>
        <AdminArticleTable />
      </section>

      <p className="text-muted-foreground">
        Welcome to the admin area. Content will be added here soon.
      </p>
      {/* TODO: Add links/components for managing articles, users, channels */}
    </div>
  );
}
