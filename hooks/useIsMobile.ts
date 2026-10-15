/**
 * useIsMobile —— 全应用共用的移动端断点判断
 *
 * 此前「是否移动端」在 Navigation、useResizableSidebar 里各写了一份监听，
 * 而且 useState(false) + useEffect 的写法会让首帧按桌面布局渲染一遍，
 * 手机上就会看到一次「桌面分栏 → 移动全屏」的闪动。
 *
 * 这里统一成一处：惰性初始化直接读当前宽度，首帧就是正确布局。
 * 断点与 Tailwind 的 md（768px）保持一致，避免 CSS 与 JS 各说各话。
 */

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;

export const useIsMobile = (breakpoint: number = MOBILE_BREAKPOINT): boolean => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
};
