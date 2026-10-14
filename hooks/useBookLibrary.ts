/**
 * useBookLibrary - 书籍库管理 Hook
 *
 * 管理「书库索引 + 当前打开的书」这一层，并把书稿的读写接到 useProject 上。
 *
 * 分工：
 *   - 本 Hook：书库列表、新建 / 导入 / 复制 / 重命名 / 删除、切换当前书；
 *     以及把 useProject 的内存数据与书库存储同步。
 *   - useProject：单本书的内存数据（chapters、images …）与编辑操作。
 *
 * 加载流程（用户视角就是「打开应用」）：
 *   1. 迁移旧版单项目数据（首次升级时）；
 *   2. 读书库索引；
 *   3. 读「上次打开的那本书」，没有则读列表第一本，都没有则新建一本空白书；
 *   4. 把书稿灌进 useProject。
 */

import { useCallback, useRef, useState } from 'react';
import { ProjectData } from '../types';
import {
  LibraryBook,
  clearLibrary,
  createBookFromProject,
  createEmptyBook,
  deleteBook as deleteBookFromStorage,
  duplicateBook as duplicateBookInStorage,
  migrateLegacyProject,
  readBook,
  readLibraryIndex,
  refreshBookMeta,
  setActiveBookId as persistActiveBookId,
  updateBookMeta,
  writeBook,
} from '../utils/bookLibrary';
import { clearBookReadingPositions } from '../utils/readingPosition';
import { parseFileToProject } from '../services/importFile';
import { dialog } from '../services/dialog';

export interface UseBookLibraryReturn {
  /** 是否已完成首次加载（含迁移） */
  isReady: boolean;
  /** 书库列表 */
  books: LibraryBook[];
  /** 当前打开的书籍 id */
  activeBookId: string | null;
  /**
   * 首次加载：迁移旧数据、读书库、决定当前书，并返回要装载的书稿。
   * 内部去重，StrictMode 下重复调用也只会真正执行一次。
   */
  initialize: () => Promise<{ bookId: string | null; project: ProjectData | null }>;
  /** 打开某本书，返回该书的数据（供上层装载） */
  openBook: (bookId: string) => Promise<ProjectData | null>;
  /** 新建空白书并切换过去 */
  createBook: (title?: string) => Promise<string | null>;
  /** 导入一个或多个文件成新书；返回新建书的 id 列表 */
  importFiles: (files: File[]) => Promise<string[]>;
  /** 复制一本书 */
  duplicateBook: (bookId: string) => Promise<string | null>;
  /** 重命名（同步索引与书稿元数据里的书名） */
  renameBook: (bookId: string, title: string) => Promise<void>;
  /** 删除一本书 */
  removeBook: (bookId: string) => Promise<void>;
  /** 把当前书籍的最新数据回写索引（章节数、体积、更新时间） */
  syncActiveBookMeta: (project: ProjectData, options?: { touch?: boolean }) => Promise<void>;
  /** 清空整个书库（重置项目用） */
  resetLibrary: () => Promise<void>;
  /** 重新从存储加载列表 */
  reload: () => Promise<void>;
}

export function useBookLibrary(): UseBookLibraryReturn {
  const [isReady, setIsReady] = useState(false);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [activeBookId, setActiveBookIdState] = useState<string | null>(null);

  // 用 ref 跟踪最新值，避免回调闭包过期
  const activeBookIdRef = useRef<string | null>(null);
  activeBookIdRef.current = activeBookId;

  // 初始化去重：StrictMode 下 effect 会执行两次，不能因此建出两本空白书
  const initPromiseRef = useRef<Promise<{ bookId: string | null; project: ProjectData | null }> | null>(null);

  const reload = useCallback(async () => {
    const index = await readLibraryIndex();
    setBooks(index.books);
    setActiveBookIdState(index.activeBookId);
  }, []);

  const initialize = useCallback(async () => {
    if (!initPromiseRef.current) {
      initPromiseRef.current = (async () => {
        try {
          // 迁移旧版单项目数据（仅首次升级时真的有旧数据）
          await migrateLegacyProject();

          const index = await readLibraryIndex();

          // 书库为空：新建一本空白书，让用户能直接开始
          if (index.books.length === 0) {
            const meta = await createEmptyBook();
            setBooks([meta]);
            setActiveBookIdState(meta.id);
            await persistActiveBookId(meta.id);
            return { bookId: meta.id, project: await readBook(meta.id) };
          }

          const targetId =
            index.activeBookId && index.books.some((b) => b.id === index.activeBookId)
              ? index.activeBookId
              : index.books[0].id;

          setBooks(index.books);
          setActiveBookIdState(targetId);

          const project = await readBook(targetId);
          if (!project) {
            // 索引里有、数据却读不到（存储被外部清掉等）：交给上层决定兜底，
            // 但不能卡在加载态。
            console.warn('书籍数据缺失', targetId);
          }
          return { bookId: targetId, project };
        } finally {
          setIsReady(true);
        }
      })();
    }
    return initPromiseRef.current;
  }, []);

  const openBook = useCallback(async (bookId: string): Promise<ProjectData | null> => {
    const project = await readBook(bookId);
    if (!project) {
      await dialog.alert('这本书的数据已丢失，无法打开。');
      await reload();
      return null;
    }

    setActiveBookIdState(bookId);
    await persistActiveBookId(bookId);
    return project;
  }, [reload]);

  const createBook = useCallback(async (title?: string): Promise<string | null> => {
    const meta = await createEmptyBook(title);
    await reload();
    setActiveBookIdState(meta.id);
    await persistActiveBookId(meta.id);
    return meta.id;
  }, [reload]);

  const importFiles = useCallback(async (files: File[]): Promise<string[]> => {
    const created: string[] = [];

    for (const file of files) {
      try {
        // 复用统一的解析服务，与「文件导入」视图保持一致的结果
        const { project } = await parseFileToProject(file);
        const meta = await createBookFromProject(project);
        created.push(meta.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await dialog.alert(`导入「${file.name}」失败：${message}`);
      }
    }

    if (created.length > 0) {
      await reload();
      // 打开最后导入的那本，用户能立刻看到结果
      const lastId = created[created.length - 1];
      setActiveBookIdState(lastId);
      await persistActiveBookId(lastId);
    }

    return created;
  }, [reload]);

  const duplicateBook = useCallback(async (bookId: string): Promise<string | null> => {
    const meta = await duplicateBookInStorage(bookId);
    if (!meta) {
      await dialog.alert('复制失败：找不到原书数据。');
      return null;
    }
    await reload();
    setActiveBookIdState(meta.id);
    await persistActiveBookId(meta.id);
    return meta.id;
  }, [reload]);

  const renameBook = useCallback(async (bookId: string, title: string): Promise<void> => {
    const clean = title.trim();
    if (!clean) return;

    // 索引里的书名
    await updateBookMeta(bookId, { title: clean });

    // 书稿元数据里的书名也要跟着改：导出时用的是 metadata.title，
    // 只改索引会导致「书库里叫 A、导出的 epub 叫 B」。
    const project = await readBook(bookId);
    if (project) {
      project.metadata = { ...project.metadata, title: clean };
      await writeBook(bookId, project);
    }

    await reload();
  }, [reload]);

  const removeBook = useCallback(async (bookId: string): Promise<void> => {
    await deleteBookFromStorage(bookId);
    // 顺手清掉这本书的阅读位置，避免留下孤儿数据
    clearBookReadingPositions(bookId);

    const next = await readLibraryIndex();
    setBooks(next.books);
    setActiveBookIdState(next.activeBookId);
  }, []);

  const syncActiveBookMeta = useCallback(
    async (project: ProjectData, options?: { touch?: boolean }) => {
      const bookId = activeBookIdRef.current;
      if (!bookId) return;
      await refreshBookMeta(bookId, project, options);
      await reload();
    },
    [reload],
  );

  const resetLibrary = useCallback(async () => {
    await clearLibrary();
    setBooks([]);
    setActiveBookIdState(null);
  }, []);

  return {
    isReady,
    books,
    activeBookId,
    initialize,
    openBook,
    createBook,
    importFiles,
    duplicateBook,
    renameBook,
    removeBook,
    syncActiveBookMeta,
    resetLibrary,
    reload,
  };
}
