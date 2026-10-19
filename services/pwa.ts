/**
 * PWA 运行时状态 —— 可安装、可离线、可更新
 *
 * 为什么单独一个「不带 React」的模块：
 *   - beforeinstallprompt 必须尽早接住（浏览器只在满足条件时派发一次），
 *     React 组件挂载后再监听可能已经错过；
 *   - 这些状态要同时被活动栏（安装按钮）、App（更新提示 / 离线标记）使用，
 *     放在模块里共享，比一层层传 prop 更省事；
 *   - 浏览器回归测试直接用 esbuild 打包 App，这里不出现任何 Vite 专有语法
 *     （import.meta.env / virtual: 模块），测试才能照常构建。
 *
 * 注意：Service Worker 的「注册」动作放在 index.tsx 里按生产环境判定后调用，
 * 开发服务器不注册（避免调试时被旧缓存干扰）。
 */

/** 浏览器给出的安装事件（TS 标准库没有这个类型） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaSnapshot {
  /** 新版本已下载完，等用户点「更新」 */
  updateAvailable: boolean;
  /** 浏览器允许弹出安装提示（Chromium 系） */
  canInstall: boolean;
  /** 已作为独立应用运行（已安装 / 从主屏打开） */
  isStandalone: boolean;
  /** iOS Safari：没有 beforeinstallprompt，只能用「分享 → 添加到主屏幕」 */
  isIosManualInstall: boolean;
  /** 当前是否在线 */
  online: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const isStandaloneNow = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    // iOS 的旧属性
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

/** iOS / iPadOS 上的 Safari（Chrome、Firefox 在 iOS 上也是 WebKit，但同样支持添加到主屏） */
const isIosDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ 桌面模式伪装成 Mac，用触摸点数量区分
  const iPadOS = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
};

let state: PwaSnapshot = {
  updateAvailable: false,
  canInstall: false,
  isStandalone: isStandaloneNow(),
  isIosManualInstall: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

const setState = (patch: Partial<PwaSnapshot>) => {
  const next = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof PwaSnapshot)[]).some((key) => state[key] !== next[key]);
  if (!changed) return;
  state = next;
  emit();
};

let installEvent: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let refreshing = false;

// ─── 安装 ────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // 拦下浏览器自带的横幅，改由应用内的入口触发，位置可控、样式跟随主题
    event.preventDefault();
    installEvent = event as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });

  window.addEventListener('appinstalled', () => {
    installEvent = null;
    setState({ canInstall: false, isStandalone: true });
  });

  // 独立窗口打开时（含从主屏图标启动）不再提供安装入口
  if (state.isStandalone) {
    setState({ canInstall: false });
  } else if (isIosDevice()) {
    setState({ isIosManualInstall: true });
  }

  // ─── 在线状态 ──────────────────────────────────────────────────────────
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
}

/** 触发浏览器安装弹窗；iOS 等不支持的环境返回 'unavailable' */
export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  if (!installEvent) return 'unavailable';
  const event = installEvent;
  installEvent = null;
  // 每次事件只能用一次；用掉后先收起入口，用户拒绝时 Chrome 也不会立刻再次派发
  setState({ canInstall: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
};

// ─── Service Worker ──────────────────────────────────────────────────────

/**
 * 注册 Service Worker（仅生产环境由 index.tsx 调用）。
 * 更新采用「提示后由用户决定」：自动刷新会丢掉编辑中尚未落盘的输入。
 */
export const registerServiceWorker = () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol)) return;

  const swUrl = new URL('sw.js', document.baseURI).href;
  const scope = new URL('.', document.baseURI).pathname;

  const trackRegistration = (reg: ServiceWorkerRegistration) => {
    registration = reg;

    // 上次已经下载好、但用户当时选了「稍后」：这次进入仍提示
    if (reg.waiting && navigator.serviceWorker.controller) {
      setState({ updateAvailable: true });
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // controller 存在 = 这是「更新」，不是首次安装
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setState({ updateAvailable: true });
        }
      });
    });

    // 应用回到前台时检查一次更新：编辑器常常一开就是一整天
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {});
    });
  };

  navigator.serviceWorker
    .register(swUrl, { scope })
    .then(trackRegistration)
    .catch(() => {
      // 注册失败（例如开发服务器没有 sw.js）不影响应用本身
    });
};

/** 采纳更新：让等待中的 SW 接管，然后刷新一次 */
export const applyUpdate = () => {
  const waiting = registration?.waiting;
  setState({ updateAvailable: false });

  if (!waiting || !navigator.serviceWorker) {
    window.location.reload();
    return;
  }

  refreshing = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) return;
    refreshing = false;
    window.location.reload();
  });

  waiting.postMessage({ type: 'SKIP_WAITING' });

  // 兜底：SW 若因故没响应 SKIP_WAITING，也不能把用户卡在「正在更新」上
  window.setTimeout(() => {
    if (!refreshing) return;
    refreshing = false;
    window.location.reload();
  }, 3000);
};

/** 关闭更新提示（本次不更新；下次进入或下次检查到更新时还会提示） */
export const dismissUpdate = () => setState({ updateAvailable: false });

// ─── 给 React 用的订阅接口（配合 useSyncExternalStore） ──────────────────

export const subscribePwa = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getPwaSnapshot = (): PwaSnapshot => state;
