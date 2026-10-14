/**
 * 书籍库存储层
 *
 * 在此之前整个应用只有「一个项目」，存在固定的 localforage key 里，
 * 换一本书就得先把旧的导出、再清空、再导入新的 —— 这正是要解决的问题。
 *
 * 现在改为「一本书 = 一个独立的存储槽 + 一份索引」：
 *   - 索引   epub_maker_library_index_v1  → { books: LibraryBook[], activeBookId }
 *   - 书稿   epub_maker_book_<bookId>     → ProjectData
 *
 * 拆成索引 + 逐本存储，而不是把整库塞进一个 key：书稿里含 base64 图片，
 * 单本就可能很大；分开存可以让「打开某本」只读那一本，也避免一次写全部。
 *
 * 兼容旧数据：首次读取时若发现旧 key，就把内容迁移成书库里的第一本书，
 * 且不删除旧 key（万一迁移逻辑有误，用户的稿子还在）。
 */

import localforage from 'localforage';
import { ProjectData } from '../types';
import { getInitialState, normalizeProject } from './projectDefaults';
import { generateUniqueId } from './idGenerator';

/** 书库索引（书目列表 + 当前打开的书） */
const INDEX_KEY = 'epub_maker_library_index_v1';
/** 单本书稿的 key 前缀 */
const BOOK_KEY_PREFIX = 'epub_maker_book_';
/** 单本书备份的 key 前缀 */
const BACKUP_KEY_PREFIX = 'epub_maker_book_backup_';
/** 旧版单项目 key，仅用于迁移 */
const LEGACY_PROJECT_KEY = 'epub_maker_project_v1';

export interface LibraryBook {
  id: string;
  /** 展示用书名，通常与 metadata.title 同步，但允许单独改（改书名不必动书稿） */
  title: string;
  author: string;
  chapterCount: number;
  imageCount: number;
  /** 书稿字节数（近似，用于展示体积） */
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
}

interface LibraryIndex {
  books: LibraryBook[];
  activeBookId: string | null;
}

const emptyIndex = (): LibraryIndex => ({ books: [], activeBookId: null });

const bookKey = (bookId: string) => `${BOOK_KEY_PREFIX}${bookId}`;

/** 读取索引；缺失或损坏时返回空索引，不抛错 */
export const readLibraryIndex = async (): Promise<LibraryIndex> => {
  try {
    const raw = await localforage.getItem<LibraryIndex>(INDEX_KEY);
    if (!raw || !Array.isArray(raw.books)) return emptyIndex();
    return {
      books: raw.books.filter((b) => b && typeof b.id === 'string'),
      activeBookId: typeof raw.activeBookId === 'string' ? raw.activeBookId : null,
    };
  } catch (e) {
    console.error('读取书库索引失败', e);
    return emptyIndex();
  }
};

const writeLibraryIndex = async (index: LibraryIndex): Promise<void> => {
  await localforage.setItem(INDEX_KEY, index);
};

/** 读取某一本书的书稿数据 */
export const readBook = async (bookId: string): Promise<ProjectData | null> => {
  try {
    const raw = await localforage.getItem<Partial<ProjectData>>(bookKey(bookId));
    if (!raw) return null;
    return normalizeProject(raw);
  } catch (e) {
    console.error('读取书籍失败', e);
    return null;
  }
};

/** 写入某一本书的书稿数据（不动索引） */
export const writeBook = async (bookId: string, project: ProjectData): Promise<void> => {
  await localforage.setItem(bookKey(bookId), project);
};

// ─── 备份 ───
// 自动保存前先把上一版存一份，写坏了还能退回去。

const backupKey = (bookId: string) => `${BACKUP_KEY_PREFIX}${bookId}`;

/** 读取某本书的备份 */
export const readBookBackup = async (bookId: string): Promise<ProjectData | null> => {
  try {
    const raw = await localforage.getItem<Partial<ProjectData>>(backupKey(bookId));
    return raw ? normalizeProject(raw) : null;
  } catch {
    return null;
  }
};

/** 写入某本书的备份 */
export const writeBookBackup = async (bookId: string, project: ProjectData): Promise<void> => {
  await localforage.setItem(backupKey(bookId), project);
};

/**
 * 估算书稿体积。
 * 只做粗算：正文按 UTF-8 字节计，图片按 base64 还原后的字节计。
 * 目的是让用户在书库里大致看出哪本大，不必精确。
 */
export const estimateProjectSize = (project: ProjectData): number => {
  let total = 0;

  const byteLength = (str: string) => {
    try {
      return new Blob([str]).size;
    } catch {
      // 无 Blob 环境（如测试 harness）退化为字符数近似
      return str.length * 2;
    }
  };

  for (const chapter of project.chapters || []) {
    total += byteLength(chapter.content || '');
  }
  for (const file of project.extraFiles || []) {
    total += byteLength(file.content || '');
  }
  total += byteLength(project.customCSS || '');
  if (project.cover) total += byteLength(project.cover);

  for (const image of project.images || []) {
    const base64 = (image.data || '').split(',')[1] || '';
    // base64 每 4 字符还原为 3 字节，再减去填充的 '='
    if (base64) {
      const padding = (base64.match(/=/g) || []).length;
      total += Math.floor((base64.length * 3) / 4) - padding;
    }
  }

  return total;
};

/** 由书稿数据生成书目元信息 */
export const buildBookMeta = (
  id: string,
  project: ProjectData,
  timestamps?: { createdAt?: number; updatedAt?: number },
): LibraryBook => {
  const now = Date.now();
  return {
    id,
    title: project.metadata?.title?.trim() || '未命名书籍',
    author: project.metadata?.creator?.trim() || '未知作者',
    chapterCount: project.chapters?.length || 0,
    imageCount: project.images?.length || 0,
    sizeBytes: estimateProjectSize(project),
    createdAt: timestamps?.createdAt ?? now,
    updatedAt: timestamps?.updatedAt ?? now,
  };
};

/**
 * 首次使用时迁移旧版单项目数据。
 *
 * 仅在没有索引、且存在旧 key 时执行一次。返回迁移出的书目（无则 null）。
 * 不删除旧 key：迁移逻辑万一有偏差，用户原稿仍可找回。
 */
export const migrateLegacyProject = async (): Promise<LibraryBook | null> => {
  try {
    const existingIndex = await localforage.getItem<LibraryIndex>(INDEX_KEY);
    if (existingIndex && Array.isArray(existingIndex.books) && existingIndex.books.length > 0) {
      return null;
    }

    let legacy: Partial<ProjectData> | null = await localforage.getItem<Partial<ProjectData>>(LEGACY_PROJECT_KEY);

    // 更老的版本把数据放在 localStorage
    if (!legacy) {
      const rawLocal = typeof window !== 'undefined' ? window.localStorage.getItem(LEGACY_PROJECT_KEY) : null;
      if (rawLocal) {
        try {
          legacy = JSON.parse(rawLocal);
        } catch {
          legacy = null;
        }
      }
    }

    if (!legacy) return null;

    const project = normalizeProject(legacy);
    const id = generateUniqueId();
    const meta = buildBookMeta(id, project);

    await writeBook(id, project);
    await writeLibraryIndex({ books: [meta], activeBookId: id });

    console.log('📚 已把旧版项目迁移为书库中的第一本书');
    return meta;
  } catch (e) {
    console.error('迁移旧版项目失败', e);
    return null;
  }
};

/** 新建一本空白书 */
export const createEmptyBook = async (title?: string): Promise<LibraryBook> => {
  const project = getInitialState();
  if (title && title.trim()) project.metadata.title = title.trim();

  const id = generateUniqueId();
  const meta = buildBookMeta(id, project);

  await writeBook(id, project);
  await addBookToIndex(meta);
  return meta;
};

/** 用给定的书稿数据新建一本书（用于导入） */
export const createBookFromProject = async (
  project: ProjectData,
  options?: { title?: string },
): Promise<LibraryBook> => {
  const normalized = normalizeProject(project);
  if (options?.title && options.title.trim()) {
    normalized.metadata = { ...normalized.metadata, title: options.title.trim() };
  }

  const id = generateUniqueId();
  const meta = buildBookMeta(id, normalized);

  await writeBook(id, normalized);
  await addBookToIndex(meta);
  return meta;
};

/** 把书目加入索引（新书插到最前，便于用户看到刚创建的那本） */
export const addBookToIndex = async (meta: LibraryBook): Promise<void> => {
  const index = await readLibraryIndex();
  index.books = [meta, ...index.books.filter((b) => b.id !== meta.id)];
  await writeLibraryIndex(index);
};

/** 更新索引里的书目信息（改书名、章节数变化等） */
export const updateBookMeta = async (
  bookId: string,
  updates: Partial<Omit<LibraryBook, 'id'>>,
): Promise<void> => {
  const index = await readLibraryIndex();
  index.books = index.books.map((b) => (b.id === bookId ? { ...b, ...updates } : b));
  await writeLibraryIndex(index);
};

/** 依据最新书稿数据刷新书目统计 */
export const refreshBookMeta = async (
  bookId: string,
  project: ProjectData,
  options?: { title?: string; touch?: boolean },
): Promise<void> => {
  const index = await readLibraryIndex();
  const existing = index.books.find((b) => b.id === bookId);
  const meta = buildBookMeta(bookId, project, {
    createdAt: existing?.createdAt,
    // touch=false 时保留原 updatedAt（仅浏览、未改动的内容不刷新时间）
    updatedAt: options?.touch === false ? existing?.updatedAt : Date.now(),
  });

  if (options?.title !== undefined) meta.title = options.title;

  index.books = index.books.map((b) => (b.id === bookId ? meta : b));
  await writeLibraryIndex(index);
};

/** 删除一本书（连同其书稿数据） */
export const deleteBook = async (bookId: string): Promise<void> => {
  const index = await readLibraryIndex();
  index.books = index.books.filter((b) => b.id !== bookId);
  if (index.activeBookId === bookId) {
    index.activeBookId = index.books[0]?.id ?? null;
  }
  await writeLibraryIndex(index);
  await localforage.removeItem(bookKey(bookId));
  await localforage.removeItem(backupKey(bookId));
};

/** 复制一本书（书稿整体深拷贝，换新 id） */
export const duplicateBook = async (bookId: string, newTitle?: string): Promise<LibraryBook | null> => {
  const source = await readBook(bookId);
  if (!source) return null;

  // 深拷贝：后续对副本的编辑不能影响原书（尤其 chapters / images 数组）
  const copy: ProjectData = JSON.parse(JSON.stringify(source));
  copy.metadata = {
    ...copy.metadata,
    title: newTitle || `${copy.metadata?.title || '未命名书籍'}（副本）`,
  };

  const id = generateUniqueId();
  const meta = buildBookMeta(id, copy);

  await writeBook(id, copy);
  await addBookToIndex(meta);
  return meta;
};

/** 记录当前打开的书（用于下次启动时恢复） */
export const setActiveBookId = async (bookId: string | null): Promise<void> => {
  const index = await readLibraryIndex();
  index.activeBookId = bookId;
  await writeLibraryIndex(index);
};

/**
 * 清空整个书库。
 * 仅供「重置项目」使用；逐本删除而非清空 localforage，避免误伤其他 key。
 */
export const clearLibrary = async (): Promise<void> => {
  const index = await readLibraryIndex();
  for (const book of index.books) {
    await localforage.removeItem(bookKey(book.id));
    await localforage.removeItem(backupKey(book.id));
  }
  await localforage.removeItem(INDEX_KEY);
};

// ─── 导出常量，供测试引用，避免测试里硬编码 key ───
export const STORAGE_KEYS = {
  INDEX: INDEX_KEY,
  BOOK_PREFIX: BOOK_KEY_PREFIX,
  LEGACY: LEGACY_PROJECT_KEY,
} as const;
