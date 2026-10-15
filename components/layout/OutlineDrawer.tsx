/**
 * OutlineDrawer —— 移动端右侧抽屉：当前章节的大纲
 *
 * 参考 Obsidian 手机端的「右抽屉」：左侧抽屉负责切换笔记（这里是章节），
 * 右侧抽屉负责在当前笔记内部跳转。手机上编辑长章节时，中途要跳到某个
 * 小标题，靠滚动找非常费劲；把大纲放在右侧抽屉里，滑一下就能定位。
 *
 * 大纲直接从章节内容里解析，而不是读 chapter.subItems：
 *   subItems 是编辑器每次改动时顺带写回的，属于「编辑过的章节才准」；
 *   这里解析的是已落盘的内容，未编辑过的章节也能立刻看到大纲。
 *
 * 条目没有 id 时不渲染成可跳转项（跳不过去），只作为纯文字展示。
 */

import React, { useEffect, useMemo } from 'react';
import { ListTree, X, Heading1, Heading2 } from 'lucide-react';
import { Chapter } from '../../types';

interface OutlineHeading {
  /** 标题元素的 id，用于 scrollIntoView / querySelector 定位 */
  id: string;
  text: string;
  level: 1 | 2;
}

interface OutlineDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 当前章节；为空时抽屉给出提示 */
  chapter: Chapter | undefined;
  /** 点击某个小标题：先切到该章节，再滚动到锚点 */
  onJump: (chapterId: string, anchorId: string) => void;
}

/**
 * 从存储格式的章节 HTML 里抽出大纲。
 * 标题按文档顺序排列；没有 id 的标题无法定位，统一给空 id 由渲染层置灰。
 */
export const extractOutline = (html: string): OutlineHeading[] => {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: OutlineHeading[] = [];

  doc.body.querySelectorAll('h1, h2').forEach((el) => {
    const text = (el.textContent || '').trim();
    headings.push({
      id: el.getAttribute('id') || '',
      text: text || '（无标题）',
      level: el.tagName === 'H1' ? 1 : 2,
    });
  });

  return headings;
};

const OutlineDrawer: React.FC<OutlineDrawerProps> = ({ open, onClose, chapter, onJump }) => {
  const headings = useMemo(() => extractOutline(chapter?.content || ''), [chapter?.content]);

  // Esc 关闭：与左侧抽屉、悬浮提示层保持一致的键盘习惯
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          data-drawer-scrim="right"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        data-drawer="right"
        data-outline-drawer="true"
        aria-label="章节大纲"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(82vw,320px)] flex-col border-l border-gray-200 bg-gray-50 transition-transform duration-200 md:hidden dark:border-gray-800 dark:bg-gray-900 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <ListTree size={13} className="flex-none" />
            大纲
          </span>
          <button
            type="button"
            onClick={onClose}
            title="关闭大纲"
            aria-label="关闭大纲"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* 当前章节名：抽屉里也要能确认「这是哪一章的大纲」 */}
        {chapter && (
          <div className="mx-2 mt-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              当前章节
            </div>
            <div className="mt-0.5 truncate text-[12px] font-semibold text-gray-700 dark:text-gray-200" title={chapter.title}>
              {chapter.title || '无标题章节'}
            </div>
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {!chapter ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-gray-400 dark:text-gray-500">
              先选择一个章节，
              <br />
              这里会列出它的小标题。
            </p>
          ) : headings.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-gray-400 dark:text-gray-500">
              这一章还没有小标题。
              <br />
              用「大标题 / 小标题」写下的标题会出现在这里。
            </p>
          ) : (
            headings.map((heading, index) => {
              const Icon = heading.level === 1 ? Heading1 : Heading2;
              const jumpable = !!heading.id;
              const indent = heading.level === 1 ? 'pl-2' : 'pl-6';

              return (
                <button
                  key={`${heading.id || 'no-id'}-${index}`}
                  type="button"
                  disabled={!jumpable}
                  data-outline-item={heading.id || undefined}
                  onClick={() => chapter && jumpable && onJump(chapter.id, heading.id)}
                  title={jumpable ? heading.text : '该标题没有锚点 id，无法跳转'}
                  className={`mb-px flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${indent} ${
                    jumpable
                      ? 'text-gray-700 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                      : 'cursor-default text-gray-400 dark:text-gray-600'
                  }`}
                >
                  <Icon
                    size={14}
                    className={`flex-none ${heading.level === 1 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{heading.text}</span>
                </button>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
};

export default OutlineDrawer;
