import React from 'react';
import { Chapter } from '../../types';
import {
  ArrowDown,
  ArrowUp,
  Combine,
  CheckSquare,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Pencil,
  Square,
  Trash2,
} from 'lucide-react';
import SubItemTree from './SubItemTree';
import { DragHandle } from '../../hooks/useDragSort';

interface ChapterItemProps {
  chapter: Chapter & { originalIndex: number };
  currentChapterId: string | null;
  totalChapters: number;
  onSelect: (id: string) => void;
  onScrollToAnchor: (chapterId: string, anchorId: string) => void;
  onToggleToc: (index: number) => void;
  onMergeNext: (index: number) => void;
  onEdit: (e: React.MouseEvent, chapter: Chapter) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onDelete: (index: number) => void;
  selectionMode?: boolean;
  batchSelected?: boolean;
  onToggleBatchSelect?: (chapterId: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}

/**
 * 目录里的一行章节。
 *
 * 紧凑面板式：单行主信息 + 一行次要信息，操作按钮平时收起、悬停/聚焦时才出现。
 * 层级用 H1/H2 图标表示（比「一级/二级」文字更直观也更省地方），
 * 是否导出到目录用书签图标表示。
 */
const ChapterItem: React.FC<ChapterItemProps> = ({
  chapter,
  currentChapterId,
  totalChapters,
  onSelect,
  onScrollToAnchor,
  onToggleToc,
  onMergeNext,
  onEdit,
  onMove,
  onDelete,
  selectionMode = false,
  batchSelected = false,
  onToggleBatchSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragging = false,
  isDropTarget = false,
}) => {
  const isActive = currentChapterId === chapter.id;
  const isIncludedInToc = !chapter.excludeFromToc;
  const idx = chapter.originalIndex;
  const LevelIcon = chapter.level === 1 ? Heading1 : Heading2;

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleBatchSelect?.(chapter.id);
      return;
    }
    onSelect(chapter.id);
  };

  return (
    <div className="mb-0.5">
      <div
        draggable={!selectionMode}
        onClick={handleRowClick}
        onDoubleClick={(event) => onEdit(event, chapter)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group relative flex cursor-pointer select-none items-start gap-1.5 rounded-md py-1.5 pl-1.5 pr-2 transition-colors ${
          isActive ? 'bg-orange-50 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        } ${isDragging ? 'opacity-40' : ''} ${
          isDropTarget ? 'ring-1 ring-inset ring-orange-400' : ''
        } ${selectionMode && batchSelected ? 'bg-orange-50 dark:bg-gray-700' : ''}`}
      >
        {/* 选中态左侧竖条：比整行反白更克制，也不影响文字的对比度 */}
        {isActive && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-orange-600 dark:bg-gray-600" />}

        {selectionMode ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleBatchSelect?.(chapter.id);
            }}
            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors ${
              batchSelected ? 'text-orange-600 dark:text-gray-300' : 'text-gray-300 hover:text-orange-500 dark:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={batchSelected ? '取消选择' : '选择章节'}
          >
            {batchSelected ? <CheckSquare size={15} /> : <Square size={15} />}
          </button>
        ) : (
          <DragHandle className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-500 dark:hover:text-gray-300" />
        )}

        {/* 层级图标 */}
        <LevelIcon
          size={15}
          className={`mt-0.5 shrink-0 ${isActive ? 'text-orange-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`min-w-0 flex-1 truncate text-[13px] leading-5 ${
                isActive ? 'font-semibold text-orange-700 dark:text-gray-200' : 'text-gray-800 dark:text-gray-200'
              }`}
              title={chapter.title}
            >
              {chapter.title || '无标题章节'}
            </span>
          </div>

          <div className="mt-px flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
            <span className="tabular-nums">#{idx + 1}</span>
            {!!chapter.subItems?.length && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span>{chapter.subItems.length} 个小标题</span>
              </>
            )}
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className={`truncate ${isIncludedInToc ? '' : 'text-orange-600 dark:text-orange-400'}`}>
              {isIncludedInToc ? '已加入目录' : '不导出到目录'}
            </span>
          </div>
        </div>

        {/* 操作区：悬停或键盘聚焦时才出现，平时让出空间给标题 */}
        {!selectionMode && (
          <div className="absolute right-1 top-1 flex items-center gap-px rounded-md border border-gray-200 bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-700 dark:bg-gray-800">
            {/* 目录开关：放在操作区最左，避免被右侧按钮挤掉；状态另有常驻文字 */}
            <RowAction
              icon={isIncludedInToc ? <Eye size={13} /> : <EyeOff size={13} />}
              title={isIncludedInToc ? '已加入目录，点击排除' : '已排除目录，点击加入'}
              highlight={isIncludedInToc}
              onClick={(event) => {
                event.stopPropagation();
                onToggleToc(idx);
              }}
            />
            {idx < totalChapters - 1 && (
              <RowAction
                icon={<Combine size={13} />}
                title="与下一章合并"
                onClick={(event) => {
                  event.stopPropagation();
                  onMergeNext(idx);
                }}
              />
            )}
            <RowAction
              icon={<Pencil size={13} />}
              title="编辑标题和 ID"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(event, chapter);
              }}
            />
            <RowAction
              icon={<ArrowUp size={13} />}
              title="上移"
              disabled={idx === 0}
              onClick={(event) => {
                event.stopPropagation();
                onMove(idx, 'up');
              }}
            />
            <RowAction
              icon={<ArrowDown size={13} />}
              title="下移"
              disabled={idx === totalChapters - 1}
              onClick={(event) => {
                event.stopPropagation();
                onMove(idx, 'down');
              }}
            />
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(idx);
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950 dark:hover:text-red-400"
              title="删除章节"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <SubItemTree
        items={chapter.subItems || []}
        onClickItem={(anchorId) => {
          onSelect(chapter.id);
          setTimeout(() => onScrollToAnchor(chapter.id, anchorId), 50);
        }}
      />
    </div>
  );
};

const RowAction: React.FC<{
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
  /** 高亮成「开启」态（如已加入目录），用来区分二值状态的一侧 */
  highlight?: boolean;
  onClick: (event: React.MouseEvent) => void;
}> = ({ icon, title, disabled = false, highlight = false, onClick }) => (
  <button
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-5 w-5 items-center justify-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
      highlight
        ? 'text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900'
        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200'
    }`}
    title={title}
  >
    {icon}
  </button>
);

export default ChapterItem;
