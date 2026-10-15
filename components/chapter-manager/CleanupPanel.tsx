import React, { useMemo } from 'react';
import { Chapter, ImageAsset } from '../../types';
import { Wand2 } from 'lucide-react';
import { dialog } from '../../services/dialog';
import {
  CLEANUP_RULE_LABELS,
  CleanupOptions,
  CleanupRuleKey,
  executeCleanup,
  previewCleanup,
} from '../../services/analysis/book';

interface CleanupPanelProps {
  chapters: Chapter[];
  images: ImageAsset[];
  /** 清理选项 */
  options: CleanupOptions;
  /** 更新选项 */
  onOptionsChange: (opts: CleanupOptions) => void;
  /** 更新章节（清理后） */
  onUpdateChapters: (chapters: Chapter[]) => void;
}

/**
 * 一键清理面板
 * 预览和执行各项内容清理规则
 */
const CleanupPanel: React.FC<CleanupPanelProps> = ({
  chapters,
  images,
  options,
  onOptionsChange,
  onUpdateChapters,
}) => {
  // 预览清理结果
  const preview = useMemo(
    () => previewCleanup(chapters, images, options),
    [chapters, images, options],
  );

  const totalIssues = preview.reduce(
    (sum, ch) => sum + ch.changes.reduce((s, c) => s + c.total, 0),
    0,
  );

  /** 执行清理 */
  const handleRunCleanup = async () => {
    const result = executeCleanup(chapters, images, options);
    if (result.totalChanges === 0) {
      await dialog.alert('当前没有可清理的问题。');
      return;
    }

    if (!(await dialog.confirm(`即将应用 ${result.totalChanges} 处清理，是否继续？`))) return;

    onUpdateChapters(result.chapters);
    await dialog.alert(`清理完成，共处理 ${result.totalChanges} 处内容问题。`);
  };

  const ruleKeys = Object.keys(options) as CleanupRuleKey[];

  return (
    <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2.5 space-y-2 dark:border-orange-800 dark:bg-orange-950">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">一键清理</div>
        <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">{totalIssues} 处待处理</span>
      </div>

      {/* 规则复选框 */}
      <div className="divide-y divide-orange-100 rounded-md border border-orange-100 bg-white dark:divide-orange-900 dark:border-orange-900 dark:bg-gray-800">
        {ruleKeys.map((key) => (
          <label
            key={key}
            className="flex items-center justify-between px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-300"
          >
            <span>{CLEANUP_RULE_LABELS[key]}</span>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) => onOptionsChange({ ...options, [key]: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
            />
          </label>
        ))}
      </div>

      {/* 预览区 */}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {preview.length > 0 ? (
          preview.slice(0, 8).map((ch) => (
            <div key={ch.chapterId} className="rounded-sm border border-orange-100 bg-white px-2 py-1.5 dark:border-orange-900 dark:bg-gray-800">
              <div className="text-[11px] font-semibold text-gray-800 truncate dark:text-gray-200">{ch.chapterTitle}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {ch.changes.map((change) => (
                  <span
                    key={change.key}
                    className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                  >
                    {change.label} {change.total}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-sm border border-orange-100 bg-white px-2 py-6 text-[11px] text-gray-400 text-center dark:border-orange-900 dark:bg-gray-800 dark:text-gray-500">
            当前没有可清理的问题。
          </div>
        )}
      </div>

      {/* 执行按钮 */}
      <button
        onClick={handleRunCleanup}
        className="w-full h-7 rounded-md bg-orange-500 px-2 text-xs font-semibold text-white hover:bg-orange-600 transition-colors dark:bg-orange-500 dark:hover:bg-orange-600"
      >
        <Wand2 size={12} className="inline mr-1.5 -mt-0.5" />
        执行清理
      </button>
    </div>
  );
};

export default CleanupPanel;
