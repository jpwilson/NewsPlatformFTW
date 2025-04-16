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
    optimizeDeps: {
      exclude: [
        '@radix-ui/react-accordion',
        '@radix-ui/react-alert-dialog',
        '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox',
        '@radix-ui/react-collapsible',
        '@radix-ui/react-context-menu',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-hover-card',
        '@radix-ui/react-label',
        '@radix-ui/react-menubar',
        '@radix-ui/react-navigation-menu',
        '@radix-ui/react-popover',
        '@radix-ui/react-progress',
        '@radix-ui/react-radio-group',
        '@radix-ui/react-scroll-area',
        '@radix-ui/react-select',
        '@radix-ui/react-separator',
        '@radix-ui/react-slider',
        '@radix-ui/react-slot',
        '@radix-ui/react-switch',
        '@radix-ui/react-tabs',
        '@radix-ui/react-toast',
        '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group',
        '@radix-ui/react-tooltip'
      ]
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
        '/api/admin-articles': {
          target: `${process.env.VITE_SUPABASE_URL}/functions/v1`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          configure: (proxy: any, _options: any) => {
            proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
              const authHeader = req.headers['authorization'];
              if (authHeader) proxyReq.setHeader('Authorization', authHeader);
              if (process.env.VITE_SUPABASE_ANON_KEY) proxyReq.setHeader('apikey', process.env.VITE_SUPABASE_ANON_KEY);
            });
            proxy.on('error', (err: any, _req: any, _res: any) => console.error('[Vite Proxy Error - /api/admin-articles]:', err));
          }
        },
        '/api/admin-channels': {
          target: `${process.env.VITE_SUPABASE_URL}/functions/v1`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          configure: (proxy: any, _options: any) => {
            proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
              const authHeader = req.headers['authorization'];
              if (authHeader) proxyReq.setHeader('Authorization', authHeader);
              if (process.env.VITE_SUPABASE_ANON_KEY) proxyReq.setHeader('apikey', process.env.VITE_SUPABASE_ANON_KEY);
            });
            proxy.on('error', (err: any, _req: any, _res: any) => console.error('[Vite Proxy Error - /api/admin-channels]:', err));
          }
        },
        '/api/is-admin': {
          target: `${process.env.VITE_SUPABASE_URL}/functions/v1`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          configure: (proxy: any, _options: any) => {
            proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
              const authHeader = req.headers['authorization'];
              if (authHeader) proxyReq.setHeader('Authorization', authHeader);
              if (process.env.VITE_SUPABASE_ANON_KEY) proxyReq.setHeader('apikey', process.env.VITE_SUPABASE_ANON_KEY);
            });
             proxy.on('error', (err: any, _req: any, _res: any) => console.error('[Vite Proxy Error - /api/is-admin]:', err));
          }
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy: any, _options: any) => {
              proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => console.log(`[Vite Proxy -> localhost:3000] Forwarding: ${req.method} ${req.url}`));
              proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => console.log(`[Vite Proxy -> localhost:3000] Response: ${proxyRes.statusCode} for ${req.url}`));
              proxy.on('error', (err: any, _req: any, _res: any) => console.error('[Vite Proxy Error - /api]:', err));
          }
        }
      },
    },
    define: {
      // Explicitly make Supabase env vars available to client
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
      'import.meta.env.VITE_MAPBOX_TOKEN': JSON.stringify(process.env.VITE_MAPBOX_TOKEN),
    }
  };
});
