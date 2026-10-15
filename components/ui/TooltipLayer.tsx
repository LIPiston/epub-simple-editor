/**
 * TooltipLayer —— 全局悬浮提示层
 *
 * 为什么需要它：原生 `title` 提示框由操作系统/浏览器绘制，页面既不能改样式，
 * 也不受页面主题影响。系统处于深色模式时它会渲染成看不清的纯黑框（Chromium 在
 * Windows 深色主题下的已知问题），所以这里自己画一个。
 *
 * 工作方式（对现有代码零侵入）：
 *   - 只挂一个监听器在 document 上，捕获 pointerover / focusin；
 *   - 命中带 `title`（或 `data-tooltip`）的元素时，把 `title` 临时挪到
 *     `data-tooltip-stash` 并移除，避免原生黑框同时冒出来；
 *   - 离开或失焦时把 `title` 原样放回 —— 因此不悬浮时 DOM 里仍有 title，
 *     无障碍语义与既有测试（querySelector('[title=...]')）都照常工作。
 *
 * 外观通过 dark: 变体跟随 <html class="dark">，不需要把主题当 prop 传进来。
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface TipState {
  text: string;
  rect: DOMRect;
}

const SHOW_DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;
const STASH_ATTR = 'data-tooltip-stash';

/** 取提示文本：优先 data-tooltip（可覆盖 title），否则用 title */
const readTipText = (el: Element): string => {
  const custom = el.getAttribute('data-tooltip');
  if (custom && custom.trim()) return custom.trim();
  return (el.getAttribute('title') || '').trim();
};

/** 悬浮开始时把原生 title 藏起来，避免和自定义提示重叠出现 */
const stashNativeTitle = (el: HTMLElement) => {
  if (!el.hasAttribute('title')) return;
  el.setAttribute(STASH_ATTR, el.getAttribute('title') || '');
  el.removeAttribute('title');
};

/**
 * 悬浮结束时还原。
 * 若期间 React 重渲染写了新的 title（例如自动保存胶囊在开关时换文案），
 * 以实时值为准，只丢掉暂存，避免把新文案覆盖成旧文案。
 */
const restoreNativeTitle = (el: HTMLElement) => {
  if (!el.hasAttribute(STASH_ATTR)) return;
  const stashed = el.getAttribute(STASH_ATTR) || '';
  el.removeAttribute(STASH_ATTR);
  if (!el.hasAttribute('title')) {
    el.setAttribute('title', stashed);
  }
};

const restoreAll = () => {
  document.querySelectorAll(`[${STASH_ATTR}]`).forEach((el) => restoreNativeTitle(el as HTMLElement));
};

const TooltipLayer: React.FC = () => {
  const [tip, setTip] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  /** 提示已经显示出来时，对应的元素 */
  const anchorRef = useRef<HTMLElement | null>(null);
  /** 延迟期间「等待显示」的元素（此时提示还没出现） */
  const pendingRef = useRef<HTMLElement | null>(null);
  const showTimer = useRef<number | null>(null);

  const clearTimer = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    if (anchorRef.current) {
      restoreNativeTitle(anchorRef.current);
      anchorRef.current = null;
    }
    setTip(null);
  }, []);

  const scheduleShow = useCallback((el: HTMLElement) => {
    const text = readTipText(el);
    if (!text) return;
    clearTimer();
    pendingRef.current = el;
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      // 延迟期间若已移开/失焦/被卸载，pendingRef 会被清掉或换人，此时不显示。
      // 用 pendingRef 判断而不是 :hover —— 键盘聚焦的元素并不会 hover，
      // 否则键盘用户就永远看不到提示了。
      if (pendingRef.current !== el || !el.isConnected) return;
      pendingRef.current = null;
      stashNativeTitle(el);
      anchorRef.current = el;
      setTip({ text, rect: el.getBoundingClientRect() });
    }, SHOW_DELAY_MS);
  }, []);

  useEffect(() => {
    const onOver = (e: Event) => {
      const target = (e.target as Element | null)?.closest?.('[title], [data-tooltip]');
      if (!(target instanceof HTMLElement)) return;
      if (target === anchorRef.current || target === pendingRef.current) return;
      hide();
      scheduleShow(target);
    };

    // 移到子元素也会触发 pointerout，只有真正离开才收起
    const onOut = (e: Event) => {
      const related = (e as PointerEvent).relatedTarget as Node | null;
      const watch = anchorRef.current ?? pendingRef.current;
      if (!watch) return;
      if (related && watch.contains(related)) return;
      hide();
    };

    const onFocusIn = (e: Event) => {
      const target = (e.target as Element | null)?.closest?.('[title], [data-tooltip]');
      if (!(target instanceof HTMLElement)) return;
      hide();
      scheduleShow(target);
    };

    // 滚动/缩放/按 Esc 都要收起，否则提示会停在旧位置
    const onScrollOrResize = () => hide();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('keydown', onKeyDown, true);
      restoreAll();
      clearTimer();
    };
  }, [hide, scheduleShow]);

  // 先渲染再量尺寸，然后定位（上方放不下就翻到下方）
  useLayoutEffect(() => {
    if (!tip) {
      setPos(null);
      return;
    }
    const el = tipRef.current;
    if (!el) return;
    const t = el.getBoundingClientRect();
    const r = tip.rect;

    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - t.width - EDGE));

    let top = r.top - t.height - GAP;
    if (top < EDGE) top = Math.min(r.bottom + GAP, window.innerHeight - t.height - EDGE);

    setPos({ top, left });
  }, [tip]);

  if (!tip) return null;

  return (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none fixed z-[2000] max-w-[260px] rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] leading-snug text-white shadow-sm dark:border-gray-300 dark:bg-gray-100 dark:text-gray-900"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        // 首帧还没定位时先隐起来，避免在左上角闪一下
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {tip.text}
    </div>
  );
};

export default TooltipLayer;
