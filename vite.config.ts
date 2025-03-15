import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  // Load env files based on mode
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  
  // Conditionally import cartographer
  const cartographerPlugin = 
    process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [(await import("@replit/vite-plugin-cartographer")).cartographer()]
      : [];
  
  return {
    plugins: [
      react(),
      runtimeErrorOverlay(),
      themePlugin(),
      ...cartographerPlugin
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "client/index.html"),
          authCallback: path.resolve(__dirname, "client/auth-callback.html"),
        },
      },
    },
    server: {
      port: 5001, // Match the port previously used by Express
      proxy: {
        '/api': {
          target: 'http://localhost:3000', // We'll run the serverless API on port 3000
          changeOrigin: true,
          secure: false
        }
      }
    },
    define: {
      // Explicitly make Supabase env vars available to client
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    }
  };
});
