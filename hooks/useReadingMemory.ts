/**
 * useReadingMemory - 记忆上次阅读位置的 Hook（可选功能）
 *
 * 职责：
 * 1. 管理功能开关（持久化到 localStorage）
 * 2. 在滚动 / 光标移动时**防抖**记录当前章节的位置
 * 3. 章节挂载时把视口和光标恢复到上次的位置
 *
 * 关闭开关时会清空已记录的坐标，避免再次开启后跳到陈旧位置。
 *
 * ⚠️ 一个关键实现约束：快照必须在**调用当时**就采集好，不能延迟到防抖
 * 回调里再去读 DOM。章节切换时 React 先把 DOM 卸载，随后才执行 effect 的
 * 清理函数，此时滚动容器已经脱离文档、`scrollHeight`/`clientHeight` 全是 0；
 * 若在那一刻才去读，就会把「滚到 0 处」当成用户的位置覆盖掉真实记录。
 * 因此这里在每次滚动/移动光标时立即拍下快照，防抖只延后**写盘**动作。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ChapterReadingPosition,
  clearReadingPositions,
  getChapterReadingPosition,
  isReadingMemoryEnabled,
  saveChapterReadingPosition,
  setReadingMemoryEnabled,
} from '../utils/readingPosition';

/** 滚动停止后多久落盘，避免每一帧都写 localStorage */
const SAVE_DEBOUNCE_MS = 500;

/** 内容总高度变化不超过这个比例时，认为可以按像素精确恢复 */
const SCROLL_HEIGHT_TOLERANCE = 0.08;

/** 把文档位置夹到合法范围内，防止内容被删减后 setTextSelection 抛错 */
const clampDocPosition = (editor: Editor, pos: number): number => {
  const max = editor.state.doc.content.size;
  return Math.max(0, Math.min(pos, max));
};

/** 判断光标是否算「在视口内」时留的余量，避免贴着边缘被行高误判 */
const CARET_VISIBLE_MARGIN = 8;

/**
 * 决定恢复时光标该落在哪。
 *
 * 阅读时「光标位置」与「视口位置」常常是分开的：在某处落笔之后往下滚着读，
 * 光标会留在视口之外。若把它原样恢复，第一次 focus()（工具栏按钮都走 focus()，
 * 默认 scrollIntoView:true）就会把视口拽到光标处；而这次跳动又会被滚动监听
 * 当成用户滚动写回记录 —— 阅读位置就此被污染。真实场景里表现为「打开时位置对，
 * 一动就跳到上次的光标那儿，并且从此记住的是那个被带跑的位置」。
 *
 * 因此只恢复确实落在视口内的光标；不在视口内就落到视口顶部第一行，
 * 让光标与视口保持一致：聚焦不再带动视口，接着打字也发生在你正看着的地方。
 */
const resolveVisibleCaret = (
  editor: Editor,
  scrollEl: HTMLElement,
  caretFrom: number,
): number | null => {
  const target = clampDocPosition(editor, caretFrom);
  const viewport = scrollEl.getBoundingClientRect();

  let caretRect: { top: number; bottom: number } | null = null;
  try {
    caretRect = editor.view.coordsAtPos(target);
  } catch {
    // 位置失效（内容被大改）：当作不在视口内，走下面的兜底
  }

  if (
    caretRect &&
    caretRect.top >= viewport.top + CARET_VISIBLE_MARGIN &&
    caretRect.bottom <= viewport.bottom - CARET_VISIBLE_MARGIN
  ) {
    return target;
  }

  // 不在视口内：反查视口顶部第一行对应的文档位置
  const probe = editor.view.posAtCoords({
    left: viewport.left + viewport.width / 2,
    top: viewport.top + CARET_VISIBLE_MARGIN,
  });

  return probe && Number.isFinite(probe.pos) ? probe.pos : null;
};

/** 记录待落盘的快照：数据独立于 DOM，元素卸载后依然有效 */
interface PendingPosition {
  chapterId: string;
  position: Omit<ChapterReadingPosition, 'updatedAt'>;
}

export interface UseReadingMemoryReturn {
  /** 是否开启记忆 */
  enabled: boolean;
  /** 切换开关 */
  toggleEnabled: () => void;
  /** 把当前章节的滚动 / 光标位置写下来（内部会防抖，可放心高频调用） */
  rememberPosition: (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null) => void;
  /** 立即落盘（用于章节切换、卸载前的收尾） */
  flushPosition: (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null) => void;
  /** 章节挂载时恢复上次位置；返回是否真的做了恢复 */
  restorePosition: (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null) => boolean;
  /**
   * 是否正在程序化恢复滚动。
   * 恢复时改动 scrollTop 同样会派发 scroll 事件，调用方需要据此把
   * 「自己滚的」和「我们滚的」区分开，否则会把恢复误判成用户操作。
   */
  restoringRef: MutableRefObject<boolean>;
}

/**
 * @param bookId 当前书籍 id。位置按书籍隔离存储 —— 书库支持「复制书籍」，
 *   副本会连同章节 id 一起深拷贝，若只按 chapterId 记录，原书与副本会互相覆盖。
 */
export function useReadingMemory(bookId: string): UseReadingMemoryReturn {
  const [enabled, setEnabled] = useState<boolean>(() => isReadingMemoryEnabled());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // bookId 可能随切换书籍而变化，用 ref 让回调始终读到最新值
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;
  // 用 ref 保存开关状态，供不需要重渲染的回调读取最新值。
  // 必须在**渲染期间**同步，而不是放进 useEffect：关闭开关时，旧 effect 的
  // 清理函数（其中的落盘逻辑）会在本次渲染提交阶段先于新 effect 执行，
  // 若此时 ref 还停留在旧值 true，就会把刚清掉的位置又写回去。
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // 程序化恢复期间置为 true，调用方据此忽略自己触发的 scroll 事件
  const restoringRef = useRef(false);
  // 最近一次健康的快照，等防抖到点或卸载收尾时落盘
  const pendingRef = useRef<PendingPosition | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 刷新 / 关标签页时补一次落盘：防抖窗口内（默认 500ms）按 F5 时，
  // React 清理函数未必来得及跑，位置就丢了。pagehide 是此时唯一可靠的钩子。
  useEffect(() => {
    const flushPending = () => {
      if (!enabledRef.current) return;
      const pending = pendingRef.current;
      if (pending) saveChapterReadingPosition(bookIdRef.current, pending.chapterId, pending.position);
    };

    window.addEventListener('pagehide', flushPending);
    return () => window.removeEventListener('pagehide', flushPending);
  }, []);

  /**
   * 采集当前位置快照。
   * 元素已脱离文档（clientHeight 为 0）时返回 null —— 这种读数没有意义，
   * 一旦写进去就会把用户真实的位置覆盖成 0。
   */
  const capture = useCallback(
    (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null): PendingPosition | null => {
      if (!chapterId || !scrollEl) return null;

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      if (clientHeight <= 0 || scrollHeight <= 0) return null;

      const scrollable = Math.max(1, scrollHeight - clientHeight);

      let caretFrom: number | null = null;
      if (editor && !editor.isDestroyed) {
        const { from } = editor.state.selection;
        caretFrom = Number.isFinite(from) ? from : null;
      }

      return {
        chapterId,
        position: {
          scrollTop,
          scrollHeight,
          clientHeight,
          ratio: scrollTop / scrollable,
          caretFrom,
        },
      };
    },
    [],
  );

  const flushPosition = useCallback(
    (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null) => {
      if (!enabledRef.current) return;

      // 优先用当下还能读到的真实值；元素已卸载则退回最后一次健康快照
      const captured = capture(chapterId, scrollEl, editor);
      const pending = captured ?? pendingRef.current;

      if (pending && pending.chapterId === chapterId) {
        saveChapterReadingPosition(bookIdRef.current, pending.chapterId, pending.position);
      }
    },
    [capture],
  );

  const rememberPosition = useCallback(
    (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null) => {
      if (!enabledRef.current) return;

      // 立刻拍快照：滚动是高频事件，但数据采集很便宜，写盘才是要防抖的部分
      const captured = capture(chapterId, scrollEl, editor);
      if (!captured) return;
      pendingRef.current = captured;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        if (pending && enabledRef.current) {
          saveChapterReadingPosition(bookIdRef.current, pending.chapterId, pending.position);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [capture],
  );

  const restorePosition = useCallback(
    (chapterId: string, scrollEl: HTMLElement | null, editor: Editor | null): boolean => {
      if (!enabledRef.current || !chapterId || !scrollEl) return false;
      // 元素还没进文档时读不到有效高度，等下一次调用
      if (scrollEl.clientHeight <= 0) return false;

      const saved = getChapterReadingPosition(bookIdRef.current, chapterId);
      if (!saved) return false;

      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);

      // 内容高度基本没变 → 按像素恢复最准；变化明显（增删了段落）→ 按进度恢复
      const heightChanged =
        saved.scrollHeight > 0 &&
        Math.abs(scrollEl.scrollHeight - saved.scrollHeight) / saved.scrollHeight > SCROLL_HEIGHT_TOLERANCE;

      const targetTop = heightChanged ? saved.ratio * maxScroll : Math.min(saved.scrollTop, maxScroll);

      restoringRef.current = true;
      // 必须用 behavior:'instant'：滚动容器带 CSS scroll-behavior:smooth，
      // 直接赋值 scrollTop 会变成一段动画，既落不到确切位置，又会在动画期间
      // 持续派发 scroll 事件、被当成用户滚动而写回错误的值。
      scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'instant' });
      requestAnimationFrame(() => {
        restoringRef.current = false;
      });

      // 恢复光标位置，但不聚焦 —— 避免页面一打开就弹出「看不见的光标」
      // （参考提交 c34a358 的同款处理）。用户点击编辑器时光标已在正确位置。
      //
      // 只恢复落在视口内的光标：阅读位置与光标常常分离，把远处的光标原样
      // 恢复会让随后的 focus() 把视口拽过去（详见 resolveVisibleCaret）。
      if (editor && !editor.isDestroyed && saved.caretFrom !== null) {
        const caret = resolveVisibleCaret(editor, scrollEl, saved.caretFrom);
        if (caret !== null) {
          try {
            editor.commands.setTextSelection(caret);
          } catch {
            // 内容变化导致位置失效时忽略，保持默认光标位置
          }
        }
      }

      return true;
    },
    [],
  );

  const toggleEnabled = useCallback(() => {
    // 副作用放在 updater 之外：React 可能在渲染阶段调用甚至丢弃 updater，
    // 在其中写 localStorage / 清缓存并不安全。
    const next = !enabledRef.current;
    setReadingMemoryEnabled(next);

    if (!next) {
      clearReadingPositions();
      pendingRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    setEnabled(next);
  }, []);

  return { enabled, toggleEnabled, rememberPosition, flushPosition, restorePosition, restoringRef };
}
