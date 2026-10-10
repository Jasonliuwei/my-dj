import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/media': 'http://localhost:4000',
    },
  },
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
