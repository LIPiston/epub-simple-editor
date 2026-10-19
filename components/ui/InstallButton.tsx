/**
 * InstallButton —— 「安装到桌面」入口
 *
 * 两处复用：桌面端活动栏底部、移动端顶栏。之所以做成组件而不是各写一遍：
 * iOS 没有 beforeinstallprompt，只能弹「分享 → 添加到主屏幕」的说明，
 * 这段判断放一处才不会两边行为不一致。
 *
 * 只在真能安装时渲染（canInstall 或 iOS 手动安装），由调用方决定样式位置。
 */

import React from 'react';
import { MonitorDown } from 'lucide-react';
import { usePwa } from '../../hooks/usePwa';
import { promptInstall } from '../../services/pwa';
import { dialog } from '../../services/dialog';

const IOS_HINT =
  '在 Safari 中点击底部的「分享」按钮，选择「添加到主屏幕」，即可像应用一样离线使用。';

interface InstallButtonProps {
  className?: string;
  size?: number;
}

const InstallButton: React.FC<InstallButtonProps> = ({ className = '', size = 18 }) => {
  const { canInstall, isIosManualInstall, isStandalone } = usePwa();

  // 已经在独立窗口里运行，或浏览器还没允许安装时不出现
  if (isStandalone || (!canInstall && !isIosManualInstall)) return null;

  const handleClick = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome !== 'unavailable') return;
    }
    if (isIosManualInstall) {
      await dialog.alert(IOS_HINT, '安装到主屏幕');
    }
  };

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      data-pwa-install="true"
      title="安装到桌面，离线也能用"
      aria-label="安装到桌面"
      className={`flex items-center justify-center rounded-md transition-colors ${className}`}
    >
      <MonitorDown size={size} />
    </button>
  );
};

export default InstallButton;
