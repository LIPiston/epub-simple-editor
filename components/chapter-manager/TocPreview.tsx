import React, { useMemo, useState } from 'react';
import { Chapter, TocItem } from '../../types';
import { Eye, EyeOff, ListTree, Save, Trash2, X } from 'lucide-react';
import { getTocStats } from '../../services/toc';

interface TocPreviewProps {
  chapters: Chapter[];
  tocTitle: string;
  onUpdateChapters: (chapters: Chapter[]) => void;
  onUpdateTocTitle: (title: string | undefined) => void;
  onClose: () => void;
}

const TocPreview: React.FC<TocPreviewProps> = ({
  chapters,
  tocTitle,
  onUpdateChapters,
  onUpdateTocTitle,
  onClose,
}) => {
  const [draftChapters, setDraftChapters] = useState<Chapter[]>(chapters.map(cloneChapter));
  const [draftTocTitle, setDraftTocTitle] = useState(tocTitle);
  const stats = useMemo(() => getTocStats(draftChapters), [draftChapters]);

  const updateChapter = (chapterId: string, updates: Partial<Chapter>) => {
    setDraftChapters((prev) =>
      prev.map((chapter) => (chapter.id === chapterId ? { ...chapter, ...updates } : chapter)),
    );
  };

  const updateSubItem = (chapterId: string, itemId: string, updates: Partial<TocItem>) => {
    setDraftChapters((prev) =>
      prev.map((chapter) => {
        if (chapter.id !== chapterId) return chapter;
        return {
          ...chapter,
          subItems: (chapter.subItems || []).map((item) =>
            item.id === itemId ? { ...item, ...updates } : item,
          ),
        };
      }),
    );
  };

  const removeSubItem = (chapterId: string, itemId: string) => {
    setDraftChapters((prev) =>
      prev.map((chapter) => {
        if (chapter.id !== chapterId) return chapter;
        return {
          ...chapter,
          subItems: (chapter.subItems || []).filter((item) => item.id !== itemId),
        };
      }),
    );
  };

  const handleSave = () => {
    onUpdateChapters(draftChapters);
    onUpdateTocTitle(draftTocTitle.trim() || undefined);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-3 animate-in fade-in duration-200 md:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(880px,96vw)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-gray-300">
                <ListTree size={14} />
                编辑导出目录
              </div>
              <h3 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{draftTocTitle || '目录'}</h3>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                修改目录文字、层级和显示状态后，导出 EPUB 会使用这里保存的目录。
              </p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Stat label="入目录" value={stats.includedChapters} />
            <Stat label="小标题" value={stats.subItemCount} />
            <Stat label="已排除" value={stats.excludedChapters} />
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              目录页标题（写入 title 和 h1）
            </span>
            <input
              value={draftTocTitle}
              onChange={(event) => setDraftTocTitle(event.target.value)}
              className="w-full h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-800 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              placeholder="目录"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 px-3 py-3 custom-scrollbar dark:bg-gray-950">
          <div className="space-y-1.5">
            {draftChapters.map((chapter, index) => {
              const included = !chapter.excludeFromToc;

              return (
                <div
                  key={chapter.id}
                  className={`rounded-md border bg-white p-2.5 transition-opacity dark:bg-gray-900 ${
                    included ? 'border-gray-200 dark:border-gray-700' : 'border-gray-200 opacity-60 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-sm bg-gray-100 font-mono text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {index + 1}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          目录标题
                        </span>
                        <input
                          value={chapter.title}
                          onChange={(event) => updateChapter(chapter.id, { title: event.target.value })}
                          className="w-full min-w-0 h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-800 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          placeholder="目录标题"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <label className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                            层级
                          </span>
                          <select
                            value={chapter.level}
                            onChange={(event) =>
                              updateChapter(chapter.id, { level: Number(event.target.value) as 1 | 2 })
                            }
                            className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                          >
                            <option value={1}>一级</option>
                            <option value={2}>二级</option>
                          </select>
                        </label>

                        <button
                          onClick={() => updateChapter(chapter.id, { excludeFromToc: included })}
                          className={`inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors ${
                            included
                              ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-400 dark:hover:bg-orange-900'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-500 dark:hover:bg-gray-600'
                          }`}
                          title={included ? '点击从目录隐藏' : '点击显示到目录'}
                        >
                          {included ? <Eye size={13} /> : <EyeOff size={13} />}
                          {included ? '显示' : '隐藏'}
                        </button>
                      </div>

                      {(chapter.subItems?.length || 0) > 0 && (
                        <div className="space-y-1.5 border-l border-gray-200 pl-2 dark:border-gray-700">
                          {chapter.subItems?.map((subItem) => (
                            <div key={subItem.id} className="rounded-md border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950">
                              <label className="block">
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                  小标题
                                </span>
                                <input
                                  value={subItem.text}
                                  onChange={(event) =>
                                    updateSubItem(chapter.id, subItem.id, { text: event.target.value })
                                  }
                                  className="w-full min-w-0 h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                  placeholder="小标题"
                                />
                              </label>

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <label className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    层级
                                  </span>
                                  <select
                                    value={subItem.level}
                                    onChange={(event) =>
                                      updateSubItem(chapter.id, subItem.id, {
                                        level: Number(event.target.value) as 1 | 2,
                                      })
                                    }
                                    className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  >
                                    <option value={1}>小节</option>
                                    <option value={2}>子节</option>
                                  </select>
                                </label>

                                <button
                                  onClick={() => removeSubItem(chapter.id, subItem.id)}
                                  className="inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                                  title="从导出目录移除"
                                >
                                  <Trash2 size={13} />
                                  移除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {draftChapters.length === 0 && (
              <div className="rounded-md border border-dashed border-gray-200 bg-white py-6 text-center text-[11px] text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
                当前没有目录项
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="inline-flex h-8 items-center rounded-md bg-orange-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              <Save size={13} className="mr-1.5" />
              保存目录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const cloneChapter = (chapter: Chapter): Chapter => ({
  ...chapter,
  subItems: chapter.subItems?.map((item) => ({ ...item })) || [],
});

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
    <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
  </div>
);

export default TocPreview;
