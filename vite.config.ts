import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/epub-simple-editor/',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    /**
     * PWA：可安装 + 离线可用。
     *
     * 这是个纯前端应用，书稿全在本机 IndexedDB 里，没有服务端，
     * 因此「断网也能继续写」是它最自然的形态：
     *   - 构建产物（HTML / JS / CSS / 图标）全部进预缓存，断网后仍能打开；
     *   - manifest 让浏览器给出「安装到桌面/主屏幕」，独立窗口运行；
     *   - 更新用 prompt 模式而不是 autoUpdate：自动刷新会在编辑过程中
     *     把尚未落盘的输入（最多 2 秒）丢掉，交给用户点「更新」更稳妥。
     *
     * 注意 manifest 的 start_url / scope 用相对路径（'.'），
     * 这样部署在 GitHub Pages 的 /epub-simple-editor/ 子路径下也能正确解析。
     */
    VitePWA({
      registerType: 'prompt',
      // 自行在 index.tsx 里注册：需要在 onNeedRefresh 里驱动应用内的更新提示。
      injectRegister: null,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'EPUB Simple Editor - 专业电子书制作工具',
        short_name: 'EPUB 编辑器',
        description:
          '在线制作 EPUB 电子书：多书管理、富文本编辑、封面设计与 EPUB 3 导出。数据保存在本机，支持离线使用。',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#f5f5f5',
        background_color: '#f5f5f5',
        categories: ['productivity', 'books'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 预缓存构建产物。字体（woff2）也纳入，避免用户上传的自定义字体
        // 在被 Service Worker 接管后出现「在线能看、离线丢字」的不一致。
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 开发服务器不注册 SW，免得调试时被旧缓存干扰；要验证离线请跑 build + preview。
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
