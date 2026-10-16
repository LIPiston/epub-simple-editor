/**
 * 同步引擎
 *
 * 只做一件事：按 plan 算出的计划，在本地书库与远端存储之间搬数据。
 * **全部由用户点击触发**，没有任何自动上传或定时任务。
 *
 * 写入顺序上的取舍：
 *   先写数据文件，最后才更新 manifest。这样万一中途失败（断网、令牌过期），
 *   云端 manifest 仍指向旧的完整状态，不会出现「清单说有、文件却没有」的
 *   半截状态。代价是可能留下孤儿数据文件，但不影响正确性。
 *
 * 两条「不删用户数据」的底线：
 *   1. 下载一律不删除本机任何书籍 —— 远端没有的书就留着，用户不该因为点了
 *      一次「从云端恢复」而丢掉本机独有的稿子。
 *   2. 本机删掉的书，只从云端清单里摘掉（下次同步不会再想拉回来），
 *      **不删除云端的数据文件**。本机存储万一被清空过，云端备份仍然完整可取。
 *      残留的孤儿文件由用户自行清理，这条取舍以「宁可留垃圾，不可丢备份」为准。
 */

import {
  BookDescriptor,
  PlanItem,
  RemoteManifest,
  RemoteStore,
  SyncMode,
  SyncOutcome,
  SyncProgress,
} from './types';
import { ProjectData } from '../../types';
import { buildSyncPlan } from './plan';
import { sha256Hex } from './sigv4';
import {
  LibraryBook,
  addBookToIndex,
  buildBookMeta,
  readBook,
  readLibraryIndex,
  writeBook,
} from '../../utils/bookLibrary';
import { normalizeProject } from '../../utils/projectDefaults';
import { generateUniqueId } from '../../utils/idGenerator';
import { providerKeyOf, readSnapshot, writeSnapshot } from './config';
import { SyncConfig } from './types';

/** 远端文件命名约定（两种 provider 共用，便于互相迁移） */
export const REMOTE_PATHS = {
  manifest: 'manifest.json',
  book: (bookId: string) => `books/${bookId}.json`,
} as const;

const MANIFEST_VERSION = 1;
const encoder = new TextEncoder();

/** 书稿内容摘要：拿序列化后的字节算 SHA-256，两端一致才认为没变 */
export const hashProject = (project: unknown): Promise<string> =>
  sha256Hex(encoder.encode(JSON.stringify(project)));

/** 本机书稿的比对信息 + 已读到的书稿数据（避免执行阶段重复读盘） */
interface LocalCollection {
  descriptors: BookDescriptor[];
  byId: Map<string, { meta: LibraryBook; project: ProjectData }>;
}

const collectLocal = async (onProgress?: (p: SyncProgress) => void): Promise<LocalCollection> => {
  const index = await readLibraryIndex();
  const descriptors: BookDescriptor[] = [];
  const byId = new Map<string, { meta: LibraryBook; project: ProjectData }>();

  for (const [i, meta] of index.books.entries()) {
    onProgress?.({ message: `读取本机书稿：${meta.title}`, done: i, total: index.books.length });

    const project = await readBook(meta.id);
    if (!project) continue; // 索引里有、数据已丢失的书跳过

    const hash = await hashProject(project);
    descriptors.push({
      id: meta.id,
      title: project.metadata?.title?.trim() || meta.title,
      author: project.metadata?.creator?.trim() || meta.author,
      updatedAt: meta.updatedAt,
      sizeBytes: meta.sizeBytes,
      chapterCount: project.chapters?.length ?? 0,
      imageCount: project.images?.length ?? 0,
      hash,
    });
    byId.set(meta.id, { meta, project });
  }

  return { descriptors, byId };
};

/** 从远端读 manifest；没有则视为「云端还没有备份」 */
export const readRemoteManifest = async (store: RemoteStore): Promise<RemoteManifest | null> => {
  const file = await store.get(REMOTE_PATHS.manifest);
  if (!file) return null;

  const text = new TextDecoder().decode(file.data);
  let parsed: Partial<RemoteManifest>;
  try {
    parsed = JSON.parse(text) as Partial<RemoteManifest>;
  } catch {
    // 清单损坏。若当作「云端为空」，下一步会全量上传并覆盖云端——风险太大，
    // 所以明确报错，交给用户处理。
    throw new Error(
      '云端 manifest.json 无法解析，可能已损坏。为避免误覆盖，已中止同步。' +
        '请在云端确认该文件，或先把它改名后再同步。',
    );
  }

  if (!parsed || !Array.isArray(parsed.books)) {
    throw new Error('云端 manifest.json 结构不符合预期，已中止同步以避免误覆盖。');
  }

  return {
    version: MANIFEST_VERSION,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    books: parsed.books.filter(
      (b): b is RemoteManifest['books'][number] => !!b && typeof (b as { id?: unknown }).id === 'string',
    ),
  };
};

/** 把一本书写进本机书库（新增或就地覆盖同 id 的那本），并更新书目索引 */
const persistLocalBook = async (
  bookId: string,
  project: ProjectData,
  title: string,
  existingMeta?: LibraryBook,
): Promise<void> => {
  const normalized = normalizeProject(project);
  if (title?.trim()) normalized.metadata = { ...normalized.metadata, title: title.trim() };

  const meta = buildBookMeta(bookId, normalized, {
    createdAt: existingMeta?.createdAt,
    updatedAt: Date.now(),
  });
  if (title?.trim()) meta.title = title.trim();

  await writeBook(bookId, normalized);
  // addBookToIndex 会先滤掉同 id 再插到最前，正好是「upsert 并置顶」的语义
  await addBookToIndex(meta);
};

export interface RunSyncOptions {
  mode: SyncMode;
  store: RemoteStore;
  config: SyncConfig;
  onProgress?: (p: SyncProgress) => void;
}

/** 执行一次同步 */
export const runSync = async ({
  mode,
  store,
  config,
  onProgress,
}: RunSyncOptions): Promise<SyncOutcome> => {
  const providerKey = providerKeyOf(config);

  // ─── 1. 两端清单 ───
  const { descriptors: local, byId: localBooks } = await collectLocal(onProgress);

  onProgress?.({ message: '读取云端清单…', done: 0, total: 0 });
  const manifest = await readRemoteManifest(store);
  const remote = manifest?.books ?? [];
  const remoteById = new Map(remote.map((b) => [b.id, b]));

  // ─── 2. 计划 ───
  const snapshot = readSnapshot(providerKey);
  const plan = buildSyncPlan({ mode, local, remote, snapshot });

  // ─── 3. 执行 ───
  const total = plan.pending.length;
  let done = 0;
  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;

  const nextRemoteBooks = new Map<string, RemoteManifest['books'][number]>(remote.map((b) => [b.id, b]));
  const nextHashes: Record<string, { hash: string }> = { ...(snapshot?.books ?? {}) };

  for (const item of plan.pending) {
    done += 1;

    if (item.action === 'forget-remote') {
      // 本机删过这本书：只摘掉云端清单条目，数据文件保留。
      // 万一本机存储出过问题，备份仍在云端可取。
      onProgress?.({ message: `移除云端记录：${item.title}`, done: done - 1, total });
      nextRemoteBooks.delete(item.bookId);
      delete nextHashes[item.bookId];
      continue;
    }

    if (item.action === 'upload') {
      const entry = localBooks.get(item.bookId);
      if (!entry) continue;

      onProgress?.({ message: `上传：${item.title}`, done: done - 1, total });
      await store.put(REMOTE_PATHS.book(item.bookId), JSON.stringify(entry.project));

      const hash = local.find((b) => b.id === item.bookId)?.hash ?? '';
      nextRemoteBooks.set(item.bookId, {
        id: item.bookId,
        title: item.title,
        author: entry.meta.author,
        updatedAt: entry.meta.updatedAt,
        sizeBytes: entry.meta.sizeBytes,
        chapterCount: entry.meta.chapterCount,
        imageCount: entry.meta.imageCount,
        hash,
      });
      nextHashes[item.bookId] = { hash };
      uploaded += 1;
      continue;
    }

    if (item.action === 'download' || item.action === 'conflict') {
      const remoteEntry = remoteById.get(item.bookId);
      if (!remoteEntry) continue;

      const label = item.action === 'conflict' ? '解决冲突' : '下载';
      onProgress?.({ message: `${label}：${item.title}`, done: done - 1, total });

      const file = await store.get(REMOTE_PATHS.book(item.bookId));
      if (!file) {
        // 清单里有、文件缺失：跳过而不是删掉清单项，避免把这个不一致悄悄掩盖
        console.warn('云端清单包含此书但数据文件缺失，已跳过：', item.bookId);
        continue;
      }

      const parsed = JSON.parse(new TextDecoder().decode(file.data)) as ProjectData;

      if (item.action === 'download') {
        // 双向模式下「云端更新」：同 id 就地覆盖，保持是同一本书
        await persistLocalBook(item.bookId, parsed, remoteEntry.title, localBooks.get(item.bookId)?.meta);
        nextHashes[item.bookId] = { hash: remoteEntry.hash };
        downloaded += 1;
      } else {
        // 冲突：两端都改过，无法安全地二选一。
        // 处置是「本地版本胜出，云端那份另存为本机副本」，两端都收敛到同一个状态：
        //   1. 先把云端版本存成本机的一本新书（内容不丢，用户可自行取舍）；
        //   2. 再把本地版本上传上去，让云端与本地一致；
        // 于是下次同步不会再报同一个冲突 —— 若只保留本地而不同步云端，
        // 下一次同步会因「云端仍是旧内容」而把冲突再报一遍，甚至反向覆盖本地。
        const copyId = generateUniqueId();
        const copy = normalizeProject(parsed);
        const baseTitle = remoteEntry.title || copy.metadata.title || '未命名书籍';
        await persistLocalBook(copyId, copy, `${baseTitle}（云端副本）`);
        nextHashes[copyId] = { hash: remoteEntry.hash };

        const entry = localBooks.get(item.bookId);
        const localHash = local.find((b) => b.id === item.bookId)?.hash ?? '';
        if (entry) {
          await store.put(REMOTE_PATHS.book(item.bookId), JSON.stringify(entry.project));
          nextRemoteBooks.set(item.bookId, {
            ...remoteEntry,
            title: item.title,
            hash: localHash,
            updatedAt: entry.meta.updatedAt,
            sizeBytes: entry.meta.sizeBytes,
            chapterCount: entry.meta.chapterCount,
            imageCount: entry.meta.imageCount,
          });
          nextHashes[item.bookId] = { hash: localHash };
        }
        conflicts += 1;
      }
      continue;
    }
  }

  // ─── 4. 回写清单 ───
  // 清单的增删都已由计划中的 upload / download / forget-remote 逐项完成，
  // 这里只负责落盘，不再做额外的删除推断。
  onProgress?.({ message: '更新云端清单…', done: total, total });
  await store.put(
    REMOTE_PATHS.manifest,
    JSON.stringify({
      version: MANIFEST_VERSION,
      updatedAt: Date.now(),
      books: Array.from(nextRemoteBooks.values()),
    } satisfies RemoteManifest),
  );

  // ─── 6. 记录基线 ───
  const finishedAt = Date.now();
  // 只为仍存在于云端的书保留基线，避免快照随删书无限增长
  const snapshotBooks: Record<string, { hash: string }> = {};
  for (const id of nextRemoteBooks.keys()) {
    const hash = nextHashes[id]?.hash;
    if (hash) snapshotBooks[id] = { hash };
  }

  writeSnapshot({ providerKey, lastSyncedAt: finishedAt, books: snapshotBooks });

  return {
    mode,
    uploaded,
    downloaded,
    conflicts,
    skipped: plan.items.filter((i) => i.action === 'in-sync').length,
    items: plan.items,
    finishedAt,
  };
};

/** 预览：只算计划，不写任何一端。用于界面上的「预览差异」。 */
export const previewSync = async (
  mode: SyncMode,
  store: RemoteStore,
  config: SyncConfig,
  onProgress?: (p: SyncProgress) => void,
): Promise<{ items: PlanItem[]; pending: PlanItem[] }> => {
  const { descriptors: local } = await collectLocal(onProgress);
  const manifest = await readRemoteManifest(store);
  const snapshot = readSnapshot(providerKeyOf(config));
  return buildSyncPlan({ mode, local, remote: manifest?.books ?? [], snapshot });
};
