/**
 * PWA 相关的全局提示：离线标记 + 新版本提示
 *
 * 两者都做成「贴着界面边缘的窄条」，不拦截正文操作：
 *   - 离线条常驻在内容区顶部。本应用离线时仍然完全可用（数据在本机
 *     IndexedDB），所以用中性灰而不是红色告警，避免吓到正在写作的用户；
 *   - 更新条浮在底部中间。自动刷新会吞掉最多 2 秒未落盘的输入，
 *     因此必须由用户点「更新」才接管。
 */

import React from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { applyUpdate, dismissUpdate } from '../../services/pwa';
import { usePwa } from '../../hooks/usePwa';

/** 离线提示：断网时说明「照常可写」，恢复后自动消失 */
export const OfflineBanner: React.FC = () => {
  const { online } = usePwa();
  if (online) return null;

  return (
    <div
      data-pwa-offline="true"
      role="status"
      className="flex-none flex items-center justify-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-850 dark:text-gray-300"
    >
      <WifiOff size={12} className="flex-none" />
      当前离线，编辑与保存照常进行，内容保存在本机
    </div>
  );
};

/** 新版本提示：下载完成后出现，用户决定何时刷新 */
export const UpdatePrompt: React.FC = () => {
  const { updateAvailable } = usePwa();
  if (!updateAvailable) return null;

  return (
    <div
      data-pwa-update="true"
      role="status"
      // 移动端靠左：右下角是自动保存胶囊（编辑视图里还会上移到状态栏之上），
      // 居中会与它重叠。桌面空间宽裕，放回底部居中。
      className="fixed left-4 bottom-4 z-[120] flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg md:left-1/2 md:-translate-x-1/2 dark:border-gray-700 dark:bg-gray-800"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <RefreshCw size={14} className="flex-none text-orange-600 dark:text-orange-400" />
      <span className="whitespace-nowrap text-gray-700 dark:text-gray-200">新版本已就绪</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-orange-700"
      >
        更新
      </button>
      <button
        type="button"
        onClick={dismissUpdate}
        title="稍后更新"
        aria-label="稍后更新"
        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <X size={13} />
      </button>
    </div>
  );
};
