import React, { useState, useEffect } from 'react';
import { Chapter } from '../../types';
import { X, Save } from 'lucide-react';
import { dialog } from '../../services/dialog';

interface ChapterEditDialogProps {
  /** 正在编辑的章节 */
  chapter: Chapter;
  /** 所有章节（用于 ID 唯一性检查） */
  allChapters: Chapter[];
  /** 保存回调 */
  onSave: (id: string, title: string) => Promise<void>;
  /** 关闭弹窗 */
  onClose: () => void;
}

/**
 * 章节编辑弹窗
 * 可编辑章节的标题和唯一 ID
 */
const ChapterEditDialog: React.FC<ChapterEditDialogProps> = ({
  chapter,
  allChapters,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState({ id: chapter.id, title: chapter.title });

  // 当外部传入的 chapter 变化时，同步表单
  useEffect(() => {
    setFormData({ id: chapter.id, title: chapter.title });
  }, [chapter.id, chapter.title]);

  const handleSave = async () => {
    const { id, title } = formData;

    if (!id.trim()) {
      await dialog.alert('ID 不能为空');
      return;
    }

    // 如果 ID 改变了，检查是否已被其他章节使用
    if (id !== chapter.id && allChapters.some((c) => c.id === id)) {
      await dialog.alert('ID 已存在，请使用唯一的 ID');
      return;
    }

    await onSave(id, title);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg border border-gray-200 w-full max-w-sm p-4 dark:bg-gray-900 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">章节设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        {/* 标题输入 */}
        <div className="mb-3">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1 dark:text-gray-400">章节标题</label>
          <input
            className="w-full h-8 border border-gray-200 rounded-md px-2.5 text-xs
              focus:border-orange-400 focus:ring-1 focus:ring-orange-300 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {/* ID 输入 */}
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1 dark:text-gray-400">唯一 ID</label>
          <input
            className="w-full h-8 border border-gray-200 rounded-md px-2.5 text-xs font-mono text-gray-600
              focus:border-orange-400 focus:ring-1 focus:ring-orange-300 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            value={formData.id}
            onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
          <p className="text-[10px] text-gray-400 mt-1 dark:text-gray-500">
            此 ID 可用于内部锚点链接 (如 href="#chapter-id")
          </p>
        </div>

        {/* 按钮栏 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-3 text-xs text-gray-600 hover:bg-gray-100 rounded-md dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="h-8 px-3 text-xs bg-orange-600 text-white hover:bg-orange-700 rounded-md
              font-semibold flex items-center dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            <Save size={13} className="mr-1.5" /> 保存更改
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChapterEditDialog;
