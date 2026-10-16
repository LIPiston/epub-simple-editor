/**
 * DrawerChapterList —— 移动端右抽屉下半的「目录」：全书章节的快捷切换
 *
 * 手机上换章节，本要先「返回目录」再点选，来回两次跳转会把
 * 「读到这里 → 去别章看一眼 → 再回来」这条路径打断。章节列表放进右抽屉下半后，
 * 与上半的「本章大纲」合成一个抽屉：上面定位小节、下面切换章节，都不必离开编辑器。
 *
 * 行只留「层级 + 序号 + 标题」，不带重命名 / 排序 / 删除 —— 那些是「目录管理」
 * 视图的职责。抽屉窄，是导航用的，不是管理用的。
 */

import React, { useEffect, useRef } from 'react';
import { Heading1, Heading2 } from 'lucide-react';
import { Chapter } from '../../types';

interface DrawerChapterListProps {
  chapters: Chapter[];
  activeChapterId: string | null;
  /** 抽屉是否打开：打开时才把当前章滚进视野（关着时元素不可见，滚了也没意义） */
  open: boolean;
  /** 点某一行：切到该章节（是否收起抽屉由调用方决定） */
  onSelect: (chapterId: string) => void;
}

const DrawerChapterList: React.FC<DrawerChapterListProps> = ({
  chapters,
  activeChapterId,
  open,
  onSelect,
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  /**
   * 打开抽屉时把当前章滚进视野。
   * 书长的时候列表打开总是停在开头，当前章（也就是你正在读的那一章）
   * 可能隔了几十行之外，下半这块「快捷切换」就得先手动找一个来回。
   * 用 block:'nearest'：已经在视野里就不动，避免每次开抽屉都跳一下。
   */
  useEffect(() => {
    if (!open || !activeChapterId) return;
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, activeChapterId, chapters.length]);

  if (chapters.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-gray-400 dark:text-gray-500">
        这本书还没有章节。
      </p>
    );
  }

  return (
    <nav aria-label="章节列表" data-drawer-chapter-list="true" className="min-h-0 flex-1 overflow-y-auto p-2">
      {chapters.map((chapter, index) => {
        const isActive = chapter.id === activeChapterId;
        const LevelIcon = chapter.level === 1 ? Heading1 : Heading2;

        return (
          <button
            key={chapter.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            data-drawer-chapter={chapter.id}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => onSelect(chapter.id)}
            title={chapter.title || '无标题章节'}
            className={`mb-px flex w-full items-center gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-left text-[13px] transition-colors ${
              isActive
                ? 'bg-orange-50 font-semibold text-orange-700 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`}
          >
            <LevelIcon
              size={14}
              className={`flex-none ${isActive ? 'text-orange-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}
            />
            {/* 序号占固定窄列：标题再长也不会把它挤没，翻章时靠它认位置 */}
            <span className="w-5 flex-none text-right text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{chapter.title || '无标题章节'}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default DrawerChapterList;
