import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chapter, ImageAsset } from '../../types';
import { Eraser, ListChecks, ListPlus, ListTree, ShieldCheck, TextSearch } from 'lucide-react';
import { dialog } from '../../services/dialog';
import { CleanupOptions } from '../../services/analysis/book';
import { getTocStats, getTocTitle } from '../../services/toc';
import { generateUniqueId } from '../../utils/idGenerator';
import { useDragSort } from '../../hooks/useDragSort';

import ChapterItem from './ChapterItem';
import ChapterEditDialog from './ChapterEditDialog';
import TocPreview from './TocPreview';
import BookSearchPanel from './BookSearchPanel';
import BatchPanel from './BatchPanel';
import CleanupPanel from './CleanupPanel';
import SensitiveWordsPanel from './SensitiveWordsPanel';

interface ChapterManagerProps {
  chapters: Chapter[];
  images: ImageAsset[];
  currentChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onScrollToAnchor: (chapterId: string, anchorId: string) => void;
  onFocusSearchText: (chapterId: string, searchText: string) => void;
  onUpdateChapters: (chapters: Chapter[]) => void;
  customTocTitle?: string;
  onUpdateTocTitle: (title: string | undefined) => void;
  className?: string;
}

type PanelType = 'none' | 'search' | 'cleanup' | 'batch' | 'sensitiveWords';

const ChapterManager: React.FC<ChapterManagerProps> = ({
  chapters,
  images,
  currentChapterId,
  onSelectChapter,
  onScrollToAnchor,
  onFocusSearchText,
  onUpdateChapters,
  customTocTitle,
  onUpdateTocTitle,
  className,
}) => {
  const [activePanel, setActivePanel] = useState<PanelType>('none');
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [showTocEditor, setShowTocEditor] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [cleanupOptions, setCleanupOptions] = useState<CleanupOptions>({
    removeEmptyParagraphs: true,
    removeBrOnlyParagraphs: true,
    removeInvalidImageRefs: true,
    normalizeHeadingIds: true,
    removeInlineStyles: false,
  });

  useEffect(() => {
    const validIds = new Set(chapters.map((chapter) => chapter.id));
    setSelectedChapterIds((prev) => {
      const cleaned = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [chapters]);

  const tocTitle = useMemo(() => customTocTitle?.trim() || getTocTitle(chapters), [chapters, customTocTitle]);
  const tocStats = useMemo(() => getTocStats(chapters), [chapters]);
  const filteredChapters = useMemo(
    () => chapters.map((chapter, index) => ({ ...chapter, originalIndex: index })),
    [chapters],
  );
  const filteredIds = useMemo(() => chapters.map((chapter) => chapter.id), [chapters]);
  const dragSort = useDragSort(chapters, onUpdateChapters);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  }, []);

  const handleAdd = useCallback(() => {
    const newChapter: Chapter = {
      id: generateUniqueId(),
      title: '新建章节',
      content: '',
      level: 1,
      subItems: [],
    };
    onUpdateChapters([...chapters, newChapter]);
    onSelectChapter(newChapter.id);
  }, [chapters, onUpdateChapters, onSelectChapter]);

  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index <= 0) return;
      if (direction === 'down' && index >= chapters.length - 1) return;

      const nextChapters = [...chapters];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [nextChapters[index], nextChapters[swapIndex]] = [nextChapters[swapIndex], nextChapters[index]];
      onUpdateChapters(nextChapters);
    },
    [chapters, onUpdateChapters],
  );

  const handleDelete = useCallback(
    (index: number) => {
      const deletedChapter = chapters[index];
      const nextChapters = chapters.filter((_, currentIndex) => currentIndex !== index);
      onUpdateChapters(nextChapters);

      if (deletedChapter?.id === currentChapterId && nextChapters.length > 0) {
        const nextIndex = Math.min(index, nextChapters.length - 1);
        onSelectChapter(nextChapters[nextIndex].id);
      }
    },
    [chapters, currentChapterId, onUpdateChapters, onSelectChapter],
  );

  const handleMergeNext = useCallback(
    async (index: number) => {
      if (index >= chapters.length - 1) return;

      const current = chapters[index];
      const next = chapters[index + 1];
      const confirmed = await dialog.confirm(
        `确定将「${current.title || '当前章节'}」与「${next.title || '下一章'}」合并吗？`,
        '合并章节',
      );
      if (!confirmed) return;

      const mergedChapter: Chapter = {
        ...current,
        content: `${current.content || ''}\n<hr class="merge-divider"/>\n${next.content || ''}`,
        subItems: [...(current.subItems || []), ...(next.subItems || [])],
        excludeFromToc: current.excludeFromToc && next.excludeFromToc,
      };

      const nextChapters = [...chapters];
      nextChapters[index] = mergedChapter;
      nextChapters.splice(index + 1, 1);
      onUpdateChapters(nextChapters);

      if (currentChapterId === next.id) {
        onSelectChapter(current.id);
      }
    },
    [chapters, currentChapterId, onUpdateChapters, onSelectChapter],
  );

  const handleToggleToc = useCallback(
    (index: number) => {
      const nextChapters = [...chapters];
      const chapter = nextChapters[index];
      nextChapters[index] = { ...chapter, excludeFromToc: !chapter.excludeFromToc };
      onUpdateChapters(nextChapters);
    },
    [chapters, onUpdateChapters],
  );

  const handleSaveEdit = useCallback(
    async (newId: string, newTitle: string) => {
      if (!editingChapter) return;

      const nextChapters = chapters.map((chapter) => {
        if (chapter.id !== editingChapter.id) return chapter;

        let nextContent = chapter.content;
        if (newTitle !== editingChapter.title && nextContent) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(nextContent, 'text/html');
          const firstH1 = doc.body.querySelector('h1');
          if (firstH1) {
            firstH1.textContent = newTitle;
            nextContent = doc.body.innerHTML;
          }
        }

        return { ...chapter, id: newId, title: newTitle, content: nextContent };
      });

      onUpdateChapters(nextChapters);

      if (currentChapterId === editingChapter.id && newId !== editingChapter.id) {
        onSelectChapter(newId);
      }

      setEditingChapter(null);
    },
    [editingChapter, chapters, currentChapterId, onUpdateChapters, onSelectChapter],
  );

  const handleStartEdit = useCallback((event: React.MouseEvent, chapter: Chapter) => {
    event.stopPropagation();
    setEditingChapter(chapter);
  }, []);

  const toggleBatchSelect = useCallback((chapterId: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedChapterIds.has(id));
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [filteredIds, selectedChapterIds]);

  return (
    <div
      className={`relative flex h-full min-w-[300px] flex-shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${
        className || 'w-96'
      }`}
    >
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-3 pb-2.5 pt-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <h2 className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">目录</h2>

          <div className="flex shrink-0 items-center gap-px">
            <PanelToggleButton
              icon={<TextSearch size={15} />}
              title="全书搜索"
              active={activePanel === 'search'}
              onClick={() => togglePanel('search')}
            />
            <PanelToggleButton
              icon={<Eraser size={15} />}
              title="一键清理"
              active={activePanel === 'cleanup'}
              onClick={() => togglePanel('cleanup')}
            />
            <PanelToggleButton
              icon={<ListChecks size={15} />}
              title="批量操作"
              active={activePanel === 'batch'}
              onClick={() => togglePanel('batch')}
            />
            <PanelToggleButton
              icon={<ShieldCheck size={15} />}
              title="敏感词修正"
              active={activePanel === 'sensitiveWords'}
              onClick={() => togglePanel('sensitiveWords')}
            />
            <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <button
              onClick={handleAdd}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="添加章节"
            >
              <ListPlus size={16} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setShowTocEditor(true)}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 transition-colors hover:border-orange-300 hover:text-orange-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:text-gray-100"
            title="编辑导出目录"
          >
            <ListTree size={14} />
            编辑目录
          </button>

          <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            <span className="tabular-nums">{tocStats.includedChapters}</span>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="tabular-nums">{tocStats.totalChapters}</span>
            <span>入目录</span>
          </div>
        </div>

        {activePanel === 'search' && (
          <BookSearchPanel chapters={chapters} onFocusSearchText={onFocusSearchText} />
        )}
        {activePanel === 'batch' && (
          <BatchPanel
            chapters={chapters}
            selectedIds={selectedChapterIds}
            filteredIds={filteredIds}
            currentChapterId={currentChapterId}
            onToggleSelectAll={toggleSelectAllFiltered}
            onClearSelection={() => setSelectedChapterIds(new Set())}
            onUpdateChapters={onUpdateChapters}
            onSelectChapter={onSelectChapter}
            onSetSelectedIds={setSelectedChapterIds}
          />
        )}
        {activePanel === 'cleanup' && (
          <CleanupPanel
            chapters={chapters}
            images={images}
            options={cleanupOptions}
            onOptionsChange={setCleanupOptions}
            onUpdateChapters={onUpdateChapters}
          />
        )}
        {activePanel === 'sensitiveWords' && (
          <SensitiveWordsPanel
            chapters={chapters}
            onUpdateChapters={onUpdateChapters}
            onFocusSearchText={onFocusSearchText}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 custom-scrollbar">
        {filteredChapters.map((chapterItem) => (
          <ChapterItem
            key={chapterItem.id}
            chapter={chapterItem}
            currentChapterId={currentChapterId}
            totalChapters={chapters.length}
            onSelect={onSelectChapter}
            onScrollToAnchor={onScrollToAnchor}
            onToggleToc={handleToggleToc}
            onMergeNext={handleMergeNext}
            onEdit={handleStartEdit}
            onMove={handleMove}
            onDelete={handleDelete}
            selectionMode={activePanel === 'batch'}
            batchSelected={selectedChapterIds.has(chapterItem.id)}
            onToggleBatchSelect={toggleBatchSelect}
            onDragStart={(event) => dragSort.handleDragStart(event, chapterItem.originalIndex)}
            onDragEnd={dragSort.handleDragEnd}
            onDragOver={(event) => dragSort.handleDragOver(event, chapterItem.originalIndex)}
            onDragLeave={dragSort.handleDragLeave}
            onDrop={(event) => dragSort.handleDrop(event, chapterItem.originalIndex)}
            isDragging={dragSort.draggedItem?.index === chapterItem.originalIndex}
            isDropTarget={dragSort.dropTarget === chapterItem.originalIndex}
          />
        ))}

        {chapters.length === 0 && (
          <div className="px-3 py-10 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">暂无章节</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">点上方的 + 创建第一章</p>
          </div>
        )}
      </div>

      {editingChapter && (
        <ChapterEditDialog
          chapter={editingChapter}
          allChapters={chapters}
          onSave={handleSaveEdit}
          onClose={() => setEditingChapter(null)}
        />
      )}
      {showTocEditor && (
        <TocPreview
          chapters={chapters}
          tocTitle={tocTitle}
          onUpdateChapters={onUpdateChapters}
          onUpdateTocTitle={onUpdateTocTitle}
          onClose={() => setShowTocEditor(false)}
        />
      )}
    </div>
  );
};

const PanelToggleButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, title, active, onClick }) => (
  <button
    onClick={onClick}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
      active
        ? 'bg-orange-50 text-orange-600 dark:bg-gray-700 dark:text-gray-300'
        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200'
    }`}
    title={title}
  >
    {icon}
  </button>
);

export default ChapterManager;
