import React, { useMemo, useState } from 'react';
import { Chapter } from '../../types';
import { searchChapters } from '../../services/analysis/book';

/** 常用正则预设 */
const PRESET_PATTERNS = [
  { label: '第X章', pattern: '第.{1,4}章' },
  { label: '第X节', pattern: '第.{1,4}节' },
  { label: '第X卷', pattern: '第.{1,4}卷' },
  { label: '连续星号', pattern: '\\*{2,}' },
  { label: '方括号占位', pattern: '【[^】]+】' },
];

interface BookSearchPanelProps {
  chapters: Chapter[];
  /** 点击搜索结果，跳转到对应章节和文本 */
  onFocusSearchText: (chapterId: string, searchText: string) => void;
}

/**
 * 全书搜索面板
 * 跨章节搜索正文内容，点击结果跳转到对应位置
 */
const BookSearchPanel: React.FC<BookSearchPanelProps> = ({ chapters, onFocusSearchText }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const results = useMemo(
    () => searchChapters(chapters, searchTerm, matchCase, useRegex),
    [chapters, searchTerm, matchCase, useRegex],
  );

  return (
    <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2.5 space-y-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600 dark:text-gray-300">全书搜索</div>
        <span className="text-[11px] text-orange-500 dark:text-gray-300">{results.length} 个命中章节</span>
      </div>

      {/* 搜索输入框 */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={useRegex ? '输入正则表达式...' : '输入关键词，跨章节搜索正文'}
          className="flex-1 min-w-0 h-7 rounded-md border border-orange-200 bg-white px-2 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
          autoFocus
        />
        {/* 区分大小写 */}
        <button
          onClick={() => setMatchCase(!matchCase)}
          className={`flex-shrink-0 h-7 rounded-md px-2 text-[11px] font-medium transition-colors ${
            matchCase
              ? 'bg-orange-500 text-white dark:bg-gray-600'
              : 'bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
          title={matchCase ? '区分大小写：开' : '区分大小写：关'}
        >
          Aa
        </button>
        {/* 正则模式 */}
        <button
          onClick={() => setUseRegex(!useRegex)}
          className={`flex-shrink-0 h-7 rounded-md px-2 text-[10px] font-bold transition-colors ${
            useRegex
              ? 'bg-orange-500 text-white dark:bg-gray-600'
              : 'bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
          title={useRegex ? '关闭正则' : '开启正则'}
        >
          .*
        </button>
      </div>

      {/* 正则预设（仅在正则模式下显示） */}
      {useRegex && (
        <div className="flex flex-wrap gap-1">
          {PRESET_PATTERNS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => setSearchTerm(preset.pattern)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                searchTerm === preset.pattern
                  ? 'bg-orange-500 text-white dark:bg-gray-600'
                  : 'bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {searchTerm.trim() && (
        <div className="max-h-52 overflow-y-auto divide-y divide-orange-100 rounded-md border border-orange-100 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
          {results.length > 0 ? (
            results.map((result) => (
              <button
                key={result.chapterId}
                onClick={() => onFocusSearchText(result.chapterId, searchTerm)}
                className="block w-full px-2 py-1.5 text-left transition-colors hover:bg-orange-50 dark:hover:bg-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800 truncate dark:text-gray-200">
                    {result.chapterTitle}
                  </span>
                  <span className="text-[10px] text-orange-600 font-bold flex-shrink-0 dark:text-gray-300">
                    {result.occurrences} 次
                  </span>
                </div>
                {result.snippets.map((snippet, i) => (
                  <div key={i} className="mt-0.5 text-[11px] text-gray-500 line-clamp-1 dark:text-gray-400">
                    {snippet}
                  </div>
                ))}
              </button>
            ))
          ) : (
            <div className="px-2 py-6 text-[11px] text-gray-400 text-center dark:text-gray-500">
              没有找到匹配内容。
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookSearchPanel;
