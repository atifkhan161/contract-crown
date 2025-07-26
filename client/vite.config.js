import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false, // Allow trying another port if 5173 is in use
    host: true, // Allow external connections for better development experience
    open: true,
    hmr: {
      port: 5173, // Ensure HMR uses the same port
      host: 'localhost'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[Vite Proxy] API proxy error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Vite Proxy] API request:', req.method, req.url);
          });
        }
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[Vite Proxy] WebSocket proxy error:', err.message);
          });
        }
      },
      '/health': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
        dashboard: resolve(__dirname, 'dashboard.html')
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
});