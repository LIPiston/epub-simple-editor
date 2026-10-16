/**
 * useCloudSync —— 云同步的界面状态
 *
 * 明确的设计取舍：**只提供手动同步**。这个 Hook 里没有任何定时器、
 * 不在 project 变化时自动触发，也不会在后台偷偷上传。全部动作都由用户
 * 在「云同步」界面里点击发起。书稿仍照旧自动保存到本机书库，云同步是
 * 额外的、显式的备份动作。
 *
 * 校验与同步都走 services/sync 里的引擎，本 Hook 只负责状态、进度与错误提示。
 */

import { useCallback, useRef, useState } from 'react';
import {
  SyncConfig,
  SyncMode,
  SyncOutcome,
  SyncProgress,
} from '../services/sync/types';
import { createRemoteStore } from '../services/sync';
import { previewSync, runSync } from '../services/sync/engine';
import { PlanItem } from '../services/sync/types';
import {
  readSyncConfig,
  writeSyncConfig,
  normalizeSyncConfig,
  providerKeyOf,
  clearSnapshot,
} from '../services/sync/config';
import { dialog } from '../services/dialog';

export type SyncBusy = null | 'testing' | 'previewing' | SyncMode;

export interface UseCloudSyncReturn {
  config: SyncConfig;
  /** 表单改动（不自动落盘，避免每敲一个字符就写一次） */
  updateConfig: (updater: (prev: SyncConfig) => SyncConfig) => void;
  /** 把当前表单写入 localStorage */
  persistConfig: () => void;
  /** 是否有未保存的表单改动 */
  isDirty: boolean;

  /** 当前正在进行的动作；null 表示空闲 */
  busy: SyncBusy;
  progress: SyncProgress | null;
  /** 最近一次同步的结果 */
  outcome: SyncOutcome | null;
  /** 预览到的计划（未执行） */
  previewItems: PlanItem[] | null;
  error: string | null;
  statusMessage: string | null;

  /** 校验连接与读写权限 */
  testConnection: () => Promise<void>;
  /** 预览差异，不写任何一端 */
  preview: (mode: SyncMode) => Promise<void>;
  /** 执行同步 */
  sync: (mode: SyncMode) => Promise<void>;
  /** 清除该远端的同步基线（下次一切重新比对） */
  resetBaseline: () => Promise<void>;
  dismissError: () => void;
}

export function useCloudSync(): UseCloudSyncReturn {
  const [config, setConfig] = useState<SyncConfig>(() => readSyncConfig());
  const [persisted, setPersisted] = useState<SyncConfig>(() => readSyncConfig());
  const [busy, setBusy] = useState<SyncBusy>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [previewItems, setPreviewItems] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 同步进行中禁止重入：连点两次会把同一本书重复上传/下载
  const runningRef = useRef(false);

  const isDirty = JSON.stringify(config) !== JSON.stringify(persisted);

  const updateConfig = useCallback((updater: (prev: SyncConfig) => SyncConfig) => {
    setConfig((prev) => normalizeSyncConfig(updater(prev)));
    setPreviewItems(null);
  }, []);

  const persistConfig = useCallback(() => {
    setConfig((current) => {
      writeSyncConfig(current);
      setPersisted(current);
      return current;
    });
  }, []);

  /** 统一的「跑一个会碰网络的活」包装：管好 busy / 错误 / 重入 */
  const runExclusive = useCallback(
    async (kind: Exclude<SyncBusy, null>, task: () => Promise<void>) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setBusy(kind);
      setError(null);
      setStatusMessage(null);

      try {
        await task();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        runningRef.current = false;
        setBusy(null);
        setProgress(null);
      }
    },
    [],
  );

  const testConnection = useCallback(
    () =>
      runExclusive('testing', async () => {
        const store = createRemoteStore(config);
        await store.test();
        setStatusMessage(`连接成功，云端正可读写：${store.location}`);
      }),
    [config, runExclusive],
  );

  const preview = useCallback(
    (mode: SyncMode) =>
      runExclusive('previewing', async () => {
        const store = createRemoteStore(config);
        const plan = await previewSync(mode, store, config, setProgress);
        setPreviewItems(plan.items);
      }),
    [config, runExclusive],
  );

  const sync = useCallback(
    (mode: SyncMode) =>
      runExclusive(mode, async () => {
        const store = createRemoteStore(config);

        // 同步前把配置落盘：快照是按远端隔离存放的，配置不落盘会导致
        // 下次打开界面读到的 providerKey 与本次不同，基线全部失效。
        writeSyncConfig(config);
        setPersisted(config);

        const result = await runSync({ mode, store, config, onProgress: setProgress });
        setOutcome(result);
        setPreviewItems(null);

        setConfig((prev) => {
          const next = { ...prev, lastSyncedAt: result.finishedAt };
          writeSyncConfig(next);
          setPersisted(next);
          return next;
        });

        const summary =
          `上传 ${result.uploaded} 本，下载 ${result.downloaded} 本` +
          (result.conflicts > 0 ? `，冲突 ${result.conflicts} 本（云端那份已另存为副本）` : '') +
          (result.skipped > 0 ? `，无需处理 ${result.skipped} 本` : '');
        setStatusMessage(`同步完成：${summary}`);
      }),
    [config, runExclusive],
  );

  const resetBaseline = useCallback(async () => {
    const confirmed = await dialog.confirm(
      '清除同步基线后，下次同步会把两端内容全部重新比对：内容不同又无基线的书会被判定为冲突。\n\n' +
        '这一步只影响本机记录的「上次同步状态」，不会改动云端或本机的书稿。\n\n继续吗？',
      '清除同步基线',
    );
    if (!confirmed) return;

    clearSnapshot(providerKeyOf(config));
    setOutcome(null);
    setPreviewItems(null);
    setStatusMessage('已清除同步基线，下次同步将重新比对两端内容。');
  }, [config]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    config,
    updateConfig,
    persistConfig,
    isDirty,
    busy,
    progress,
    outcome,
    previewItems,
    error,
    statusMessage,
    testConnection,
    preview,
    sync,
    resetBaseline,
    dismissError,
  };
}
