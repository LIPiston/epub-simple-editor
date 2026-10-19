/**
 * ActivityBar —— 一级菜单（活动栏）
 *
 * 参考 VS Code：只显示图标的窄竖条，按分组列出功能，鼠标悬停给出名称。
 * 点击当前分组 = 收起/展开二级面板（VS Code 的同一行为），点击其他分组 = 切换面板。
 */

import React from 'react';
import { Download, MonitorDown, Moon, RotateCcw, Sun } from 'lucide-react';
import { NavGroup } from './navConfig';
import { usePwa } from '../../hooks/usePwa';
import { promptInstall } from '../../services/pwa';
import { dialog } from '../../services/dialog';

interface ActivityBarProps {
  groups: NavGroup[];
  /** 当前展开的分组 */
  activeGroupId: string;
  /** 二级面板是否已收起（收起时点击当前分组可重新展开） */
  panelCollapsed: boolean;
  onSelectGroup: (groupId: string) => void;
  onExport: () => void;
  onReset: () => void;
  /** 当前是否深色主题 */
  isDark: boolean;
  /** 单击切换深/浅色（结果会被记住） */
  onToggleTheme: () => void;
  className?: string;
}

const ActivityBar: React.FC<ActivityBarProps> = ({
  groups,
  activeGroupId,
  panelCollapsed,
  onSelectGroup,
  onExport,
  onReset,
  isDark,
  onToggleTheme,
  className = '',
}) => {
  const { canInstall, isIosManualInstall, isStandalone } = usePwa();

  // 安装入口只在真的能装的时候出现：
  //   - Chromium 系：要等 beforeinstallprompt（浏览器确认满足可安装条件才会派发）；
  //   - iOS：没有这个事件，只能给出「分享 → 添加到主屏幕」的说明；
  //   - 已经在独立窗口里运行：不必再提示安装。
  const showInstall = !isStandalone && (canInstall || isIosManualInstall);

  const handleInstall = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome !== 'unavailable') return;
    }
    if (isIosManualInstall) {
      await dialog.alert(
        '在 Safari 中点击底部的「分享」按钮，选择「添加到主屏幕」，即可像应用一样离线使用。',
        '安装到主屏幕',
      );
    }
  };

  return (
  <nav
    aria-label="一级导航"
    className={`w-11 flex-none flex-col items-center border-r border-gray-200 bg-gray-100 py-2 dark:border-gray-800 dark:bg-gray-900 ${className}`}
  >
    {groups.map((group) => {
      const Icon = group.icon;
      const isActive = group.id === activeGroupId;
      // 面板收起时，当前分组不算「高亮展开」，避免和收起状态混淆
      const showActive = isActive && !panelCollapsed;

      return (
        <button
          key={group.id}
          type="button"
          data-nav-level="1"
          data-nav-id={group.id}
          // 让测试能按「视图 id」反查所属分组，不必重复一份分组表
          data-nav-views={group.views.map((view) => view.id).join(',')}
          data-active={showActive ? 'true' : 'false'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelectGroup(group.id)}
          title={isActive && !panelCollapsed ? `${group.label}（点击收起）` : group.label}
          aria-expanded={showActive}
          className={`relative my-px flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
            showActive
              ? 'bg-white text-orange-600 dark:bg-gray-800 dark:text-gray-300'
              : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
          }`}
        >
          {showActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-orange-600 dark:bg-gray-400" />
          )}
          <Icon size={18} />
        </button>
      );
    })}

    <div className="mt-auto flex flex-col items-center gap-px pt-2">
      {/* 安装到桌面：可安装时才出现（见上面的 showInstall 判定） */}
      {showInstall && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleInstall}
          data-pwa-install="true"
          title="安装到桌面，离线也能用"
          aria-label="安装到桌面"
          className="flex h-9 w-9 items-center justify-center rounded-md text-orange-600 transition-colors hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-gray-800"
        >
          <MonitorDown size={18} />
        </button>
      )}
      {/* 深色/浅色切换：单击即切，选择会被记住（首次进入跟随系统） */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleTheme}
        data-theme-toggle="true"
        data-theme={isDark ? 'dark' : 'light'}
        title={isDark ? '当前深色主题，点击切换到浅色主题' : '当前浅色主题，点击切换到深色主题'}
        aria-label={isDark ? '当前深色主题，点击切换到浅色主题' : '当前浅色主题，点击切换到深色主题'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onExport}
        title="导出 EPUB"
        className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      >
        <Download size={18} />
      </button>
      <button
        type="button"
        onClick={onReset}
        title="重置项目"
        className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-red-600 dark:hover:bg-gray-800 dark:hover:text-red-400"
      >
        <RotateCcw size={17} />
      </button>
    </div>
  </nav>
  );
};

export default ActivityBar;
