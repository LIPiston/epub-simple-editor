import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './services/pwa';
// 应用外壳样式（Tailwind），构建时编译成一个 CSS 文件，
// 由 Service Worker 预缓存，离线打开也有样式。
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/*
  Service Worker 只在生产构建里注册：
  开发服务器走 Vite 的热更新，注册 SW 会让浏览器拿到构建期的旧资源，
  调试时很难分辨「代码没生效」还是「被缓存挡住了」。
  vite.config.ts 的 devOptions.enabled 也保持关闭，两处一致。

  注册放在首屏渲染之后，不占用启动路径。
  `import.meta.env.PROD` 由 Vite 在构建时替换成常量；开发服务器下为 false，
  因此本地调试不会注册 Service Worker。
*/
if (import.meta.env.PROD) {
  registerServiceWorker();
}
