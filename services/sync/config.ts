/**
 * 同步配置与快照的持久化
 *
 * 配置（含凭据）放 localStorage：它是纯界面设置，不属于书稿内容，
 * 不该被导出、也不该被自动保存卷进去。快照同理。
 *
 * 关于凭据安全：密钥确实会以明文存在本机浏览器里。这是纯前端应用无法回避的
 * ——没有服务端可以替用户保管。界面里明确提示了这一点，并建议使用
 * 「只授予单个目录/桶权限」的专用凭据，把风险限制在可接受范围。
 */

import { SyncConfig, SyncSnapshot } from './types';

const CONFIG_KEY = 'epub-simple-editor-sync-config-v1';
const SNAPSHOT_KEY_PREFIX = 'epub-simple-editor-sync-snapshot-';

/** 默认配置 */
export const defaultSyncConfig = (): SyncConfig => ({
  provider: 'webdav',
  webdav: {
    baseUrl: '',
    username: '',
    password: '',
    remoteDir: 'epub-simple-editor',
  },
  s3: {
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    bucket: '',
    prefix: 'epub-simple-editor',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
    forcePathStyle: false,
  },
  lastSyncedAt: null,
});

/** 补齐缺失字段，兼容以后新增的配置项 */
export const normalizeSyncConfig = (raw: Partial<SyncConfig> | null | undefined): SyncConfig => {
  const base = defaultSyncConfig();
  if (!raw) return base;

  return {
    ...base,
    ...raw,
    provider: raw.provider === 's3' ? 's3' : 'webdav',
    webdav: { ...base.webdav, ...(raw.webdav || {}) },
    s3: { ...base.s3, ...(raw.s3 || {}) },
    lastSyncedAt: typeof raw.lastSyncedAt === 'number' ? raw.lastSyncedAt : null,
  };
};

export const readSyncConfig = (): SyncConfig => {
  if (typeof window === 'undefined') return defaultSyncConfig();
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? normalizeSyncConfig(JSON.parse(raw)) : defaultSyncConfig();
  } catch {
    return defaultSyncConfig();
  }
};

export const writeSyncConfig = (config: SyncConfig): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 隐私模式等写不进去：内存里的配置依然可用，只是刷新后丢失
  }
};

/**
 * 远端身份标识：切换存储后，旧快照不再适用（基线对不上会误判成冲突），
 * 所以快照按这个 key 分开存放。
 */
export const providerKeyOf = (config: SyncConfig): string => {
  if (config.provider === 'webdav') {
    const { baseUrl, remoteDir } = config.webdav;
    return `webdav:${baseUrl.trim()}|${remoteDir.trim()}`;
  }
  const { endpoint, bucket, prefix } = config.s3;
  return `s3:${endpoint.trim()}|${bucket.trim()}|${prefix.trim()}`;
};

export const readSnapshot = (providerKey: string): SyncSnapshot | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY_PREFIX + providerKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SyncSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !parsed.books) return null;
    return {
      providerKey,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : null,
      books: parsed.books,
    };
  } catch {
    return null;
  }
};

export const writeSnapshot = (snapshot: SyncSnapshot): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY_PREFIX + snapshot.providerKey, JSON.stringify(snapshot));
  } catch {
    // 同上，静默降级：最坏情况是下次同步把「两端都改过」判成冲突，不会丢数据
  }
};

export const clearSnapshot = (providerKey: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY_PREFIX + providerKey);
  } catch {
    // 忽略
  }
};

/** 供测试引用，避免硬编码 key */
export const SYNC_STORAGE_KEYS = {
  CONFIG: CONFIG_KEY,
  SNAPSHOT_PREFIX: SNAPSHOT_KEY_PREFIX,
} as const;
