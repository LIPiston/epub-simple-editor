/**
 * usePwa —— 读取 PWA 运行时状态
 *
 * 状态源在 services/pwa.ts（模块级单例），这里只负责订阅。
 * useSyncExternalStore 保证多个组件看到的是同一份快照，
 * 不会出现「活动栏已显示安装按钮、App 却仍认为不可安装」的错位。
 */

import { useSyncExternalStore } from 'react';
import { getPwaSnapshot, subscribePwa, PwaSnapshot } from '../services/pwa';

export const usePwa = (): PwaSnapshot =>
  useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaSnapshot);
