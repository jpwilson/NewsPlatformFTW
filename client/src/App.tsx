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

// Check if we're running in production (Vercel) or development
const isProduction = process.env.NODE_ENV === "production";
console.log("Environment:", process.env.NODE_ENV);

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
      <Route path="/articles/:id" component={ArticlePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth-callback" component={AuthCallback} />
      <Route path="/profile" component={ProfilePage} />
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
