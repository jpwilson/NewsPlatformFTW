import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { SelectedChannelProvider } from "@/hooks/use-selected-channel";
import { ThemeProvider } from "@/hooks/use-theme";
import { ProtectedRoute } from "./lib/protected-route";
import { AdminRouteGuard } from "@/components/admin-route-guard";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ArticlePage from "@/pages/article-page";
import CreateArticle from "@/pages/create-article";
import CreateChannel from "@/pages/create-channel";
import ChannelPage from "@/pages/channel-page";
import ChannelsPage from "@/pages/channels-page";
import AuthCallback from "./pages/auth-callback";
import ProfilePage from "./pages/profile-page";
import EditArticle from "@/pages/edit-article";
import ManageSubscribersPage from "@/pages/manage-subscribers";
import AdminPage from "@/pages/admin-page";
import { Analytics } from "@vercel/analytics/react";
import { HelmetProvider } from "react-helmet-async";
import { useEffect } from "react";

// Check if we're running in production (Vercel) or development
const isProduction = process.env.NODE_ENV === "production";
console.log("Environment:", process.env.NODE_ENV);

// Component to handle redirecting old date-based article URLs to ID-based URLs
function ArticleRedirect() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    async function fetchArticleId() {
      try {
        // Extract the slug from the URL
        const slug = location.split("/articles/")[1];
        if (!slug) return;

        // Fetch the article ID from the API using the slug
        const response = await fetch(
          `/api/articles/by-slug/${encodeURIComponent(slug)}`
        );
        if (response.ok) {
          const data = await response.json();
          // Redirect to the new ID-based URL format
          setLocation(`/articles/${data.id}/${slug}`);
        }
      } catch (error) {
        console.error("Error redirecting article:", error);
      }
    }

    fetchArticleId();
  }, [location, setLocation]);

  return <div>Redirecting...</div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <ProtectedRoute
        path="/channels/:id/articles/new"
        component={CreateArticle}
      />
      <ProtectedRoute path="/channels/new" component={CreateChannel} />
      <ProtectedRoute
        path="/channels/:id/subscribers"
        component={ManageSubscribersPage}
      />
      <Route path="/channels/:id" component={ChannelPage} />
      <Route path="/channels" component={ChannelsPage} />
      <ProtectedRoute path="/articles/new" component={CreateArticle} />
      <ProtectedRoute path="/articles/:id/edit" component={EditArticle} />
      <Route path="/articles/:id/:slug?" component={ArticlePage} />
      <Route path="/articles/:slug" component={ArticleRedirect} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth-callback" component={AuthCallback} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/users/:username" component={ProfilePage} />
      <Route path="/admin">
        <AdminRouteGuard>
          <AdminPage />
        </AdminRouteGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <AuthProvider>
          <SelectedChannelProvider>
            <ThemeProvider defaultTheme="light">
              <Router />
              <Analytics />
              <Toaster />
            </ThemeProvider>
          </SelectedChannelProvider>
        </AuthProvider>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;
