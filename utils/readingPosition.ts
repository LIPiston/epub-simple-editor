/**
 * 阅读位置记忆（可选功能）
 *
 * 长篇书稿在浏览器里编辑时，用户常常需要「上次看到哪，下次接着看」。
 * 这里把「最近编辑的章节 + 各章节的滚动位置与光标位置」记到 localStorage，
 * 与书稿数据（IndexedDB / localforage）分开保存：
 *   - 它是界面偏好，不属于书稿内容，不应被导出或卷入自动保存与备份；
 *   - 体积很小且写入频繁，用 localStorage 同步读写最省事。
 *
 * ⚠️ 记录必须按**书籍**隔离。书库里可以「复制」一本书，副本会连同章节
 * id 一起深拷贝，两本书于是拥有完全相同的 chapterId；若位置只按 chapterId
 * 存，原书与副本会互相覆盖对方的位置。因此这里以 bookId 为最外层键。
 *
 * 恢复策略见 TextEditor.tsx：内容高度基本没变时按像素恢复，否则按滚动
 * 进度（ratio）恢复，避免增删内容后跳错位置。
 */

export interface ChapterReadingPosition {
  /** 滚动容器当前的 scrollTop */
  scrollTop: number;
  /** 记录时的内容总高度，用于判断内容是否发生了明显变化 */
  scrollHeight: number;
  /** 滚动容器可视高度 */
  clientHeight: number;
  /** 滚动进度 0~1，内容高度变化时的兜底 */
  ratio: number;
  /** ProseMirror 文档位置，恢复后光标停在这里（不自动聚焦） */
  caretFrom: number | null;
  updatedAt: number;
}

/** 单本书的阅读状态 */
interface BookReadingState {
  /** 最近一次记录位置的章节 */
  lastChapterId: string | null;
  positions: Record<string, ChapterReadingPosition>;
}

interface ReadingState {
  version: 2;
  books: Record<string, BookReadingState>;
  /**
   * 旧版（未分书）遗留数据的暂存位。
   * 旧结构是扁平的 { lastChapterId, positions }，语义上只属于「当时那一本」。
   * 读到后先原样留在这里，等第一次有书声明归属时再认领，避免丢用户的位置。
   */
  legacyFlat?: BookReadingState;
}

const STORAGE_KEY = 'epub-maker-reading-position';
const ENABLED_KEY = 'epub-maker-reading-position-enabled';

/** 最多记住多少章的位置（每本书各自计数），避免长期使用后无限增长 */
const MAX_CHAPTERS = 60;

const emptyBookState = (): BookReadingState => ({ lastChapterId: null, positions: {} });

const emptyState = (): ReadingState => ({ version: 2, books: {} });

/** 校验一个章节位置对象是否可用（只认关键字段齐全的） */
const isPositionLike = (value: unknown): value is ChapterReadingPosition => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<ChapterReadingPosition>;
  return typeof p.scrollTop === 'number' && typeof p.scrollHeight === 'number';
};

const sanitizeBookState = (raw: unknown): BookReadingState => {
  if (!raw || typeof raw !== 'object') return emptyBookState();
  const book = raw as Partial<BookReadingState>;
  const positions: Record<string, ChapterReadingPosition> = {};

  if (book.positions && typeof book.positions === 'object') {
    for (const [chapterId, position] of Object.entries(book.positions)) {
      if (isPositionLike(position)) positions[chapterId] = position;
    }
  }

  return {
    lastChapterId: typeof book.lastChapterId === 'string' ? book.lastChapterId : null,
    positions,
  };
};

const read = (): ReadingState => {
  if (typeof window === 'undefined') return emptyState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return emptyState();

    // 新版结构
    if (parsed.version === 2 && parsed.books && typeof parsed.books === 'object') {
      const books: Record<string, BookReadingState> = {};
      for (const [bookId, state] of Object.entries(parsed.books as Record<string, unknown>)) {
        books[bookId] = sanitizeBookState(state);
      }
      return {
        version: 2,
        books,
        legacyFlat: parsed.legacyFlat ? sanitizeBookState(parsed.legacyFlat) : undefined,
      };
    }

    // 旧版扁平结构：留待认领，不直接丢弃
    if (parsed.positions && typeof parsed.positions === 'object') {
      return { version: 2, books: {}, legacyFlat: sanitizeBookState(parsed) };
    }

    return emptyState();
  } catch {
    return emptyState();
  }
};

const write = (state: ReadingState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 无痕模式或配额用尽：静默降级，不影响正常编辑
  }
};

/** 取某本书的状态；若存在未被认领的旧版数据，则由第一本书认领它 */
const bookState = (state: ReadingState, bookId: string): BookReadingState => {
  if (state.legacyFlat) {
    const claimed = state.books[bookId];
    state.books[bookId] = claimed ?? state.legacyFlat;
    delete state.legacyFlat;
  }
  return state.books[bookId] ?? emptyBookState();
};

/** 最近一次查看的章节 id（用于刷新页面后回到那一章） */
export const getLastReadingChapterId = (bookId: string): string | null => {
  if (!bookId) return null;
  return bookState(read(), bookId).lastChapterId;
};

/** 读取某本书中某一章的阅读位置 */
export const getChapterReadingPosition = (
  bookId: string,
  chapterId: string,
): ChapterReadingPosition | null => {
  if (!bookId || !chapterId) return null;
  const position = bookState(read(), bookId).positions[chapterId];
  return position && typeof position.scrollTop === 'number' ? position : null;
};

/** 记录某本书某一章的阅读位置，并把该章标记为「最近查看的章节」 */
export const saveChapterReadingPosition = (
  bookId: string,
  chapterId: string,
  position: Omit<ChapterReadingPosition, 'updatedAt'>,
): void => {
  if (!bookId || !chapterId) return;

  const state = read();
  const book = bookState(state, bookId);
  book.positions[chapterId] = { ...position, updatedAt: Date.now() };
  book.lastChapterId = chapterId;
  state.books[bookId] = book;

  const entries = Object.entries(book.positions);
  if (entries.length > MAX_CHAPTERS) {
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    book.positions = Object.fromEntries(entries.slice(0, MAX_CHAPTERS));
  }

  write(state);
};

/**
 * 只把某一章标记为「最近查看的章节」，不写入滚动坐标。
 *
 * 用于用户只是打开某章浏览、并未编辑或滚动的情况 —— 刷新后仍应回到这一章。
 */
export const markChapterAsCurrent = (bookId: string, chapterId: string): void => {
  if (!bookId || !chapterId) return;
  const state = read();
  const book = bookState(state, bookId);
  book.lastChapterId = chapterId;
  state.books[bookId] = book;
  write(state);
};

/** 清空所有已记住的阅读位置（所有书） */
export const clearReadingPositions = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上，静默降级
  }
};

/** 删除某本书的位置记录（删除书籍时调用，避免留下孤儿数据） */
export const clearBookReadingPositions = (bookId: string): void => {
  if (!bookId) return;
  const state = read();
  if (state.books[bookId]) {
    delete state.books[bookId];
    write(state);
  }
};

/**
 * 记忆功能是否开启。
 *
 * 默认关闭：这是「可选」功能，用户明确开启后才会写入与恢复位置。
 */
export const isReadingMemoryEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

/** 开关记忆功能；关闭时一并清掉已记录的位置，避免下次开启后跳到陈旧位置 */
export const setReadingMemoryEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ENABLED_KEY, String(enabled));
    if (!enabled) window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默降级
  }
};

/**
 * 读取某本书「上次查看的章节」，供刷新页面后自动打开。
 * 功能关闭时返回 null，保持原有「总是打开第一章」的行为。
 */
export const getResumeChapterId = (bookId: string): string | null => {
  if (!isReadingMemoryEnabled()) return null;
  return getLastReadingChapterId(bookId);
};
