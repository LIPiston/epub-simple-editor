/**
 * useDrawerGestures —— 移动端抽屉的边缘滑动手势（参考 Obsidian 手机端）
 *
 * 参考的操作约定：
 *   - 从屏幕左边缘向右滑 → 拉出左侧导航抽屉；
 *   - 从屏幕右边缘向左滑 → 拉出右侧大纲抽屉；
 *   - 抽屉已经打开时，在抽屉上朝关闭方向滑 → 收起；
 *   - 点遮罩关闭（那属于组件自己的点击处理，不在这里）。
 *
 * 为什么用「边缘 + 方向阈值」而不是跟手位移：
 *   编辑区的正文是可以横向选择文字、纵向滚动的。手势若从任意位置起算、
 *   或跟手拖动，就会和选词、滚动打架。这里只在贴着边缘起手、
 *   且横向位移明显压过纵向时才认账，其余情况一律放行给页面。
 *
 * 手势只在移动端启用（桌面用鼠标，不会有 touch 事件）。
 */

import { useEffect, useRef } from 'react';

/** 距屏幕边缘多少像素内起手才算拉抽屉 */
const EDGE = 28;
/** 松开时横向位移达到多少像素才判定成功 */
const THRESHOLD = 56;
/** 起手后需要超过多少像素才认定方向 */
const SLOP = 12;
/** 横向位移要压过纵向位移的倍数，避免和纵向滚动抢手势 */
const DOMINANCE = 1.2;

type Mode = 'open-left' | 'close-left' | 'open-right' | 'close-right';

/** 每个模式下「成功」所需的滑动方向：+1 向右、-1 向左 */
const DIRECTION: Record<Mode, 1 | -1> = {
  'open-left': 1,
  'close-left': -1,
  'open-right': -1,
  'close-right': 1,
};

interface UseDrawerGesturesOptions {
  /** 仅移动端启用 */
  enabled: boolean;
  /** 左侧导航抽屉是否已打开 */
  leftOpen: boolean;
  /** 右侧大纲抽屉是否已打开 */
  rightOpen: boolean;
  onOpenLeft: () => void;
  onCloseLeft: () => void;
  onOpenRight: () => void;
  onCloseRight: () => void;
}

export const useDrawerGestures = ({
  enabled,
  leftOpen,
  rightOpen,
  onOpenLeft,
  onCloseLeft,
  onOpenRight,
  onCloseRight,
}: UseDrawerGesturesOptions): void => {
  // 状态与回调放进 ref，手势监听器只挂一次，不必随每次开合重新订阅
  const stateRef = useRef({ leftOpen, rightOpen });
  stateRef.current = { leftOpen, rightOpen };

  const handlersRef = useRef({ onOpenLeft, onCloseLeft, onOpenRight, onCloseRight });
  handlersRef.current = { onOpenLeft, onCloseLeft, onOpenRight, onCloseRight };

  useEffect(() => {
    if (!enabled) return;

    let mode: Mode | null = null;
    let startX = 0;
    let startY = 0;
    let engaged = false;

    const reset = () => {
      mode = null;
      engaged = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      reset();
      // 多指（缩放、双指操作）不参与手势
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      const { leftOpen: left, rightOpen: right } = stateRef.current;
      const target = e.target as Element | null;

      if (left) {
        // 关闭手势必须从抽屉本体上起手；落在遮罩上交给遮罩的点击处理
        if (target?.closest?.('[data-drawer="left"]')) mode = 'close-left';
        return;
      }
      if (right) {
        if (target?.closest?.('[data-drawer="right"]')) mode = 'close-right';
        return;
      }

      // 都没打开：只有贴着左右边缘起手才认为是拉抽屉
      if (touch.clientX <= EDGE) mode = 'open-left';
      else if (touch.clientX >= window.innerWidth - EDGE) mode = 'open-right';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!mode || engaged) return;
      if (e.touches.length !== 1) {
        reset();
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (Math.abs(dx) < SLOP) return;

      // 纵向为主 → 这是页面滚动，不是抽屉手势
      if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) {
        reset();
        return;
      }
      // 方向不对 → 放行（例如抽屉开着时向右滑，不该被吃掉）
      if (Math.sign(dx) !== DIRECTION[mode]) {
        reset();
        return;
      }

      // 手势成立：抢占本次触摸，避免拉抽屉的同时正文跟着滚
      engaged = true;
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!mode || !engaged) {
        reset();
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const passed = dx * DIRECTION[mode] >= THRESHOLD;
      const action = mode;
      reset();

      if (!passed) return;
      const handlers = handlersRef.current;
      if (action === 'open-left') handlers.onOpenLeft();
      else if (action === 'close-left') handlers.onCloseLeft();
      else if (action === 'open-right') handlers.onOpenRight();
      else handlers.onCloseRight();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    // touchmove 需要 preventDefault 抢占滚动，因此不能是 passive
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', reset, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', reset, { capture: true });
    };
  }, [enabled]);
};
