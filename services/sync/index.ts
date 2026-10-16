/**
 * provider 工厂：按配置造出对应的远端存储。
 *
 * 单独一层是为了让 engine / hook / 界面都不必关心是哪种存储，
 * 只对着 RemoteStore 接口写代码。
 */

import { createS3Store } from './providers/s3';
import { createWebDavStore } from './providers/webdav';
import { RemoteStore, SyncConfig } from './types';

/** 按当前配置创建远端存储；配置不完整时抛出可读的错误 */
export const createRemoteStore = (config: SyncConfig): RemoteStore => {
  if (config.provider === 's3') {
    const { endpoint, bucket, accessKeyId, secretAccessKey } = config.s3;
    if (!endpoint.trim()) throw new Error('请先填写 S3 服务端点。');
    if (!bucket.trim()) throw new Error('请先填写存储桶名称。');
    if (!accessKeyId.trim() || !secretAccessKey.trim()) {
      throw new Error('请先填写 Access Key ID 与 Secret Access Key。');
    }
    return createS3Store(config.s3);
  }

  if (!config.webdav.baseUrl.trim()) throw new Error('请先填写 WebDAV 服务地址。');
  return createWebDavStore(config.webdav);
};

export * from './types';
export { buildSyncPlan, summarizePlan } from './plan';
export { runSync, previewSync, REMOTE_PATHS, hashProject, readRemoteManifest } from './engine';
export {
  defaultSyncConfig,
  normalizeSyncConfig,
  readSyncConfig,
  writeSyncConfig,
  readSnapshot,
  writeSnapshot,
  clearSnapshot,
  providerKeyOf,
  SYNC_STORAGE_KEYS,
} from './config';
