/**
 * Navigation —— 两级导航的外壳
 *
 * 组合一级活动栏与二级侧边面板，并管理两种状态：
 *   - 桌面端：二级面板可整体收起，收起后只留活动栏（VS Code 的行为）；
 *   - 移动端：两级一起作为抽屉从左侧滑出，由顶栏的菜单按钮控制显隐。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ViewMode } from '../../types';
import ActivityBar from './ActivityBar';
import SidePanel from './SidePanel';
import { NAV_GROUPS, findGroupIdForView, getGroup } from './navConfig';
import { useIsMobile } from '../../hooks/useIsMobile';

interface NavigationProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onExport: () => void;
  onReset: () => void;
  currentBookTitle?: string;
  /** 移动端抽屉是否打开 */
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** 当前是否深色主题 */
  isDark: boolean;
  /** 切换深/浅色 */
  onToggleTheme: () => void;
}

const COLLAPSE_STORAGE_KEY = 'epub-simple-editor-nav-collapsed';

const Navigation: React.FC<NavigationProps> = ({
  currentView,
  onViewChange,
  onExport,
  onReset,
  currentBookTitle,
  mobileOpen,
  onMobileClose,
  isDark,
  onToggleTheme,
}) => {
  // 分组跟随当前视图：从书库点「打开」跳到目录管理时，
  // 活动栏高亮与面板内容都要跟着切到「内容」分组。
  const [activeGroupId, setActiveGroupId] = useState(() => findGroupIdForView(currentView));
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  });
  const isMobile = useIsMobile();

  // 当前视图变了（含从书库「打开」跳转），一级分组随之同步
  useEffect(() => {
    setActiveGroupId(findGroupIdForView(currentView));
  }, [currentView]);

  const toggleCollapsed = useCallback(() => {
    setPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  /**
   * 点击一级菜单：
   *   换分组 → 切到该分组并展开面板；
   *   点当前分组 → 折叠/展开面板（与 VS Code 一致）。
   */
  const handleSelectGroup = useCallback(
    (groupId: string) => {
      if (groupId === activeGroupId) {
        if (isMobile) {
          onMobileClose();
        } else {
          toggleCollapsed();
        }
        return;
      }

      setActiveGroupId(groupId);
      setPanelCollapsed(false);
      localStorage.setItem(COLLAPSE_STORAGE_KEY, 'false');

      if (isMobile) return;

      // 换组时把视图切到该组的第一项，避免「高亮在新组、内容还是旧视图」
      const first = getGroup(groupId).views[0];
      if (first) onViewChange(first.id);
    },
    [activeGroupId, isMobile, onMobileClose, onViewChange, toggleCollapsed],
  );

  const handleViewChange = useCallback(
    (view: ViewMode) => {
      onViewChange(view);
      if (isMobile) onMobileClose();
    },
    [isMobile, onMobileClose, onViewChange],
  );

  const group = getGroup(activeGroupId);
  // 移动端抽屉里二级面板始终展开；桌面端由 collapsed 控制
  const showPanel = isMobile || !panelCollapsed;

  return (
    <>
      {isMobile && mobileOpen && (
        <div
          data-drawer-scrim="left"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <div
        data-drawer={isMobile ? 'left' : undefined}
        className={`z-50 flex h-full ${
          isMobile
            ? `fixed inset-y-0 left-0 transition-transform duration-200 ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : 'relative'
        }`}
      >
        <ActivityBar
          groups={NAV_GROUPS}
          activeGroupId={activeGroupId}
          panelCollapsed={isMobile ? false : panelCollapsed}
          onSelectGroup={handleSelectGroup}
          onExport={onExport}
          onReset={onReset}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
          className={isMobile ? 'flex bg-gray-100 dark:bg-gray-900' : 'flex'}
        />

        {showPanel && (
          <SidePanel
            group={group}
            currentView={currentView}
            onViewChange={handleViewChange}
            onCollapse={toggleCollapsed}
            currentBookTitle={currentBookTitle}
            isMobile={isMobile}
            onClose={onMobileClose}
            className="flex bg-gray-50 dark:bg-gray-900"
          />
        )}
      </div>
    </>
  );
};

export default Navigation;
