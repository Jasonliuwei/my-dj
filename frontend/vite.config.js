import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 本地只调前端时,可在 frontend/.env.local 里写 API_TARGET=https://dj.b2dream.net 直接连线上后端
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), '').API_TARGET || 'http://localhost:4000';
  const proxy = { target, changeOrigin: true };
  return {
    plugins: [react(), removeCrossorigin()],
    server: {
      port: 5173,
      proxy: { '/api': proxy, '/media': proxy },
    },
  };
});

/**
 * Vite 默认给 <script type="module"> 和 <link> 加上 crossorigin，
 * Safari 在 file:// 下会因为 CORS 限制拒绝执行模块脚本。
 * 这个插件在构建后移除 crossorigin 属性，让 Safari 也能打开。
 */
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/\bcrossorigin\s*/g, '');
    },
  };
}
