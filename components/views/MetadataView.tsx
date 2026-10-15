import React from 'react';
import { ProjectData } from '../../types';

interface MetadataViewProps {
  metadata: ProjectData['metadata'];
  onUpdate: (metadata: ProjectData['metadata']) => void;
}

const INPUT_CLASS =
  'h-8 w-full text-[13px] text-gray-900 bg-white border border-gray-200 rounded-md px-2 ' +
  'outline-none transition-colors focus:border-orange-500 focus:ring-1 focus:ring-orange-500 ' +
  'placeholder:text-gray-400 dark:text-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:placeholder:text-gray-500';

const LABEL_CLASS = 'w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400';

const MetadataView: React.FC<MetadataViewProps> = ({ metadata, onUpdate }) => {
  const handleChange = (key: keyof ProjectData['metadata'], value: any) => {
    onUpdate({ ...metadata, [key]: value });
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Compact sticky toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">书籍信息</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">Metadata</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <form
          className="max-w-3xl bg-white border border-gray-200 rounded-md divide-y divide-gray-200 dark:bg-gray-900 dark:border-gray-800 dark:divide-gray-800"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* 书名 */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label htmlFor="meta-title" className={LABEL_CLASS}>书名</label>
            <input
              id="meta-title"
              type="text"
              className={INPUT_CLASS}
              value={metadata.title}
              onChange={e => handleChange('title', e.target.value)}
            />
          </div>

          {/* 作者 */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label htmlFor="meta-creator" className={LABEL_CLASS}>作者</label>
            <input
              id="meta-creator"
              type="text"
              className={INPUT_CLASS}
              value={metadata.creator}
              onChange={e => handleChange('creator', e.target.value)}
            />
          </div>

          {/* 语言 */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label htmlFor="meta-language" className={LABEL_CLASS}>语言</label>
            <input
              id="meta-language"
              type="text"
              className={INPUT_CLASS}
              value={metadata.language}
              onChange={e => handleChange('language', e.target.value)}
            />
          </div>

          {/* 系列 */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label htmlFor="meta-series" className={LABEL_CLASS}>系列</label>
            <input
              id="meta-series"
              type="text"
              className={INPUT_CLASS}
              placeholder="例如：哈利波特系列"
              value={metadata.series || ''}
              onChange={e => handleChange('series', e.target.value)}
            />
          </div>

          {/* 标签 */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label htmlFor="meta-subjects" className={LABEL_CLASS}>标签</label>
            <input
              id="meta-subjects"
              type="text"
              className={INPUT_CLASS}
              placeholder="例如：奇幻, 魔法, 冒险 (用逗号分隔)"
              value={metadata.subjects?.join(', ') || ''}
              onChange={e => handleChange('subjects', e.target.value.split(/[，,]/).map((s: string) => s.trim()).filter((s: string) => s))}
            />
          </div>

          {/* 简介 */}
          <div className="flex items-start gap-3 px-3 py-2">
            <label htmlFor="meta-description" className={`${LABEL_CLASS} pt-1.5`}>简介</label>
            <textarea
              id="meta-description"
              rows={5}
              className={`${INPUT_CLASS} h-auto resize-none leading-relaxed`}
              placeholder="书籍简介…"
              value={metadata.description}
              onChange={e => handleChange('description', e.target.value)}
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default MetadataView;
