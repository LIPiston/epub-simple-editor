/**
 * 阅读位置记忆（可选功能）
 *
 * 长篇书稿在浏览器里编辑时，用户常常需要「上次看到哪，下次接着看」。
 * 这里把「最近编辑的章节 + 各章节的滚动位置与光标位置」记到 localStorage，
 * 与书稿数据（IndexedDB / localforage）分开保存：
 *   - 它是界面偏好，不属于书稿内容，不应被导出或卷入自动保存与备份；
 *   - 体积很小且写入频繁，用 localStorage 同步读写最省事。
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

interface ReadingState {
  /** 最近一次记录位置的章节 */
  lastChapterId: string | null;
  positions: Record<string, ChapterReadingPosition>;
}

const STORAGE_KEY = 'epub-maker-reading-position';
const ENABLED_KEY = 'epub-maker-reading-position-enabled';

/** 最多记住多少章的位置，避免长期使用后无限增长 */
const MAX_CHAPTERS = 60;

const createEmptyState = (): ReadingState => ({ lastChapterId: null, positions: {} });

const read = (): ReadingState => {
  if (typeof window === 'undefined') return createEmptyState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();

    const parsed = JSON.parse(raw) as Partial<ReadingState>;
    return {
      lastChapterId: typeof parsed?.lastChapterId === 'string' ? parsed.lastChapterId : null,
      positions: parsed?.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
    };
  } catch {
    return createEmptyState();
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

/** 最近一次编辑的章节 id（用于刷新页面后回到那一章） */
export const getLastReadingChapterId = (): string | null => read().lastChapterId;

/** 读取某一章的阅读位置 */
export const getChapterReadingPosition = (chapterId: string): ChapterReadingPosition | null => {
  if (!chapterId) return null;
  const position = read().positions[chapterId];
  return position && typeof position.scrollTop === 'number' ? position : null;
};

/** 记录某一章的阅读位置，并把该章标记为「最近编辑的章节」 */
export const saveChapterReadingPosition = (
  chapterId: string,
  position: Omit<ChapterReadingPosition, 'updatedAt'>,
): void => {
  if (!chapterId) return;

  const state = read();
  state.positions[chapterId] = { ...position, updatedAt: Date.now() };
  state.lastChapterId = chapterId;

  const entries = Object.entries(state.positions);
  if (entries.length > MAX_CHAPTERS) {
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    state.positions = Object.fromEntries(entries.slice(0, MAX_CHAPTERS));
  }

  write(state);
};

/**
 * 只把某一章标记为「最近查看的章节」，不写入滚动坐标。
 *
 * 用于用户只是打开某章浏览、并未编辑或滚动的情况 —— 刷新后仍应回到这一章。
 */
export const markChapterAsCurrent = (chapterId: string): void => {
  if (!chapterId) return;
  const state = read();
  state.lastChapterId = chapterId;
  write(state);
};

/** 清空所有已记住的阅读位置 */
export const clearReadingPositions = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上，静默降级
  }
};

/**
 * 记忆功能是否开启。
 *
 * 默认关闭：这是「可选」功能，用户明确开启后才会写入和恢复位置。
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
 * 读取「上次查看的章节」，供刷新页面后自动打开。
 * 功能关闭时返回 null，保持原有「总是打开第一章」的行为。
 */
export const getResumeChapterId = (): string | null => {
  if (!isReadingMemoryEnabled()) return null;
  return getLastReadingChapterId();
};
