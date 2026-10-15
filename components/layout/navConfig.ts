/**
 * 导航配置 —— 两级菜单的唯一数据源
 *
 * 参考 VS Code 的结构：
 *   一级（活动栏 Activity Bar）：只放图标的分组竖条，始终可见；
 *   二级（侧边面板 Side Panel）：当前分组下的具体视图，可整体收起。
 *
 * 之前侧边栏是一长条平铺的 8 个入口，层级只有一个，入口一多就难扫读。
 * 这里把它们收成 4 个分组，二级面板只显示当前分组的内容。
 */

import {
  Book,
  FileUp,
  Image as ImageIcon,
  Info,
  Library,
  ListTree,
  Package,
  Palette,
} from 'lucide-react';
import { ViewMode } from '../../types';

/** 图标组件的形状约束（只用到 size / className） */
export type NavIcon = React.ComponentType<{ size?: number | string; className?: string }>;

/** 二级菜单项：一个具体的视图 */
export interface NavView {
  id: ViewMode;
  label: string;
  icon: NavIcon;
}

/** 一级菜单项：一个分组 */
export interface NavGroup {
  id: string;
  label: string;
  icon: NavIcon;
  views: NavView[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'library',
    label: '书库',
    icon: Library,
    views: [
      { id: 'library', label: '书籍管理', icon: Library },
      { id: 'files', label: '文件导入', icon: FileUp },
    ],
  },
  {
    id: 'content',
    label: '内容',
    icon: ListTree,
    views: [
      { id: 'chapters', label: '目录管理', icon: ListTree },
      { id: 'metadata', label: '书籍信息', icon: Info },
    ],
  },
  {
    id: 'design',
    label: '设计',
    icon: Palette,
    views: [
      { id: 'styles', label: '样式主题', icon: Palette },
      { id: 'images', label: '图片素材', icon: ImageIcon },
      { id: 'cover', label: '封面设计', icon: Book },
    ],
  },
  {
    id: 'publish',
    label: '发布',
    icon: Package,
    views: [{ id: 'structure', label: '文件管理', icon: Package }],
  },
];

/** 应用启动时进入的视图 */
export const DEFAULT_VIEW: ViewMode = 'library';

/** 某个视图属于哪个分组；视图不在任何分组时退回第一个分组 */
export const findGroupIdForView = (view: ViewMode): string =>
  NAV_GROUPS.find((group) => group.views.some((item) => item.id === view))?.id ?? NAV_GROUPS[0].id;

/** 按 id 取分组 */
export const getGroup = (groupId: string): NavGroup =>
  NAV_GROUPS.find((group) => group.id === groupId) ?? NAV_GROUPS[0];
