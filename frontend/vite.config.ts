import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite 配置 - 前后端分离开发联调
// 开发模式: npm run dev -> localhost:3000, API 代理到 localhost:8080
// 生产模式: npm run build -> 输出到 dist/, 由 build.sh 拷贝到 backend/public/dist/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // 输出到 frontend/dist/, build.sh 负责拷贝到 backend/public/dist/
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // 所有 /api 前缀的 HTTP 请求代理到 Go 后端
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
      // WebSocket 连接代理 (路径也以 /api 开头)
      '/api/v1/monitor/ws': {
        target: 'ws://localhost:8088',
        ws: true,
      },
      '/api/v1/nf/logs/ws': {
        target: 'ws://localhost:8088',
        ws: true,
      },
      '/api/v1/deployment/ws': {
        target: 'ws://localhost:8088',
        ws: true,
      },
    },
  },
});
