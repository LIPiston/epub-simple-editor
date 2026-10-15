/**
 * SidePanel —— 二级菜单（可收回的侧边面板）
 *
 * 只显示「当前分组」下的视图，随一级菜单切换而更换；整体可收起
 * （点击面板右上角的收起按钮，或再次点击活动栏上已激活的分组）。
 */

import React from 'react';
import { ChevronLeft, Library, X } from 'lucide-react';
import { ViewMode } from '../../types';
import { NavGroup } from './navConfig';

interface SidePanelProps {
  group: NavGroup;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  /** 收起二级面板 */
  onCollapse: () => void;
  /** 当前书名（书库支持多本后，需要一眼看出在编辑哪一本） */
  currentBookTitle?: string;
  /** 移动端抽屉模式：显示关闭按钮 */
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

const SidePanel: React.FC<SidePanelProps> = ({
  group,
  currentView,
  onViewChange,
  onCollapse,
  currentBookTitle,
  isMobile = false,
  onClose,
  className = '',
}) => (
  <div
    className={`w-52 flex-none flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 ${className}`}
  >
    <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
      <span className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {group.label}
      </span>
      {isMobile ? (
        <button
          type="button"
          onClick={onClose}
          title="关闭导航"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <X size={16} />
        </button>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCollapse}
          title="收起侧边栏"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <ChevronLeft size={16} />
        </button>
      )}
    </div>

    {currentBookTitle && (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onViewChange('library')}
        title="当前编辑的书籍，点击回到书籍管理"
        className="mx-2 mt-1.5 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
      >
        <Library size={13} className="flex-none text-orange-500 dark:text-gray-300" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          {currentBookTitle}
        </span>
      </button>
    )}

    <nav aria-label="二级导航" className="flex-1 overflow-y-auto p-2">
      {group.views.map((view) => {
        const Icon = view.icon;
        const isActive = currentView === view.id;

        return (
          <button
            key={view.id}
            type="button"
            data-nav-level="2"
            data-nav-id={view.id}
            data-active={isActive ? 'true' : 'false'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onViewChange(view.id)}
            className={`mb-px flex w-full items-center rounded-md px-2 py-1.5 text-[13px] transition-colors ${
              isActive
                ? 'bg-orange-50 font-semibold text-orange-700 dark:bg-gray-700 dark:text-gray-200'
                : 'font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`}
          >
            <Icon size={15} className={`mr-2 flex-none ${isActive ? 'text-orange-600 dark:text-gray-300' : 'text-gray-400'}`} />
            <span className="truncate">{view.label}</span>
          </button>
        );
      })}
    </nav>
  </div>
);

export default SidePanel;
