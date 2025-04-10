import React from "react";
import { AdminArticleTable } from "@/components/admin-article-table";
import { Link } from "wouter";
import { Newspaper } from "lucide-react";

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

        <section className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Manage Articles</h2>
          <AdminArticleTable />
        </section>

        <p className="text-muted-foreground">
          Welcome to the admin area. Content will be added here soon.
        </p>
        {/* TODO: Add links/components for managing articles, users, channels */}
      </div>
    </>
  );
}
