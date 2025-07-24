import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        ws: true
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
        dashboard: resolve(__dirname, 'dashboard.html'),
        sw: resolve(__dirname, 'sw.js')
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
});