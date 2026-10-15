/**
 * useTheme —— 深色/浅色主题开关
 *
 * 行为约定（用户需求）：
 *   - 首次进入跟随系统（prefers-color-scheme）；
 *   - 用户点过一次之后，改为跟随用户的选择，不再被系统改动影响；
 *   - 选择记在 localStorage，刷新后仍然生效。
 *
 * 主题落地方式：在 <html> 上加减 `dark` class（Tailwind 配了 darkMode: 'class'），
 * 同时同步 `color-scheme` 让滚动条、表单控件等原生 UI 跟随主题。
 *
 * 注意：与 index.html 里的首屏脚本共用同一个 key，改了这里必须同步改那边。
 */

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'epub-maker-theme';

const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(SYSTEM_QUERY).matches;

/** 读取用户显式选择；没选过返回 null（表示跟随系统） */
const readStoredTheme = (): Theme | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
};

/** 把主题写到 <html> 上 */
const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
};

export const useTheme = () => {
  // 初始值：用户选过就用用户的，没选过跟随系统
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light'));
  // 是否已经由用户显式决定（决定后不再跟随系统）
  const [isUserChosen, setIsUserChosen] = useState<boolean>(() => readStoredTheme() !== null);

  // 主题变化时落到 DOM 上
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 未由用户决定时，跟随系统变化实时切换
  useEffect(() => {
    if (isUserChosen || typeof window === 'undefined') return;
    const mql = window.matchMedia(SYSTEM_QUERY);
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [isUserChosen]);

  /** 显式设定并记住 */
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setIsUserChosen(true);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 隐私模式下写不进去也不该影响使用，内存里的状态仍然生效
    }
  }, []);

  /** 单击切换：在当前明暗之间反转 */
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, isDark: theme === 'dark', isUserChosen, setTheme, toggleTheme };
};
