/**
 * EditorStatusBar - 编辑器底部状态栏
 *
 * 功能：
 * 1. 显示字数统计和阅读时间
 * 2. 字体大小调整控件
 * 3. 阅读位置记忆开关（长篇编辑用）
 * 4. 响应式显示（移动端精简）
 */

import React from 'react';
import { AlignJustify, Bookmark, BookmarkCheck, Clock, Type, Plus, Minus } from 'lucide-react';
import type { FontSize } from '../../hooks/useEditorSettings';

interface EditorStatusBarProps {
  /** 字符数 */
  charCount: number;
  /** 预计阅读时间（分钟） */
  readingTime: number;
  /** 当前字体大小 */
  fontSize: FontSize;
  /** 字体大小改变回调 */
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  /** 是否可以增大字体 */
  canIncrease: boolean;
  /** 是否可以减小字体 */
  canDecrease: boolean;
  /** 是否开启阅读位置记忆 */
  readingMemoryEnabled: boolean;
  /** 切换阅读位置记忆 */
  onToggleReadingMemory: () => void;
}

const FONT_SIZE_LABEL: Record<FontSize, string> = {
  small: '小',
  base: '标准',
  medium: '中',
  large: '大',
};

/**
 * 编辑器底部状态栏
 */
const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  charCount,
  readingTime,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  canIncrease,
  canDecrease,
  readingMemoryEnabled,
  onToggleReadingMemory,
}) => {
  return (
    <div className="flex-none h-10 bg-white border-t border-gray-100 flex items-center justify-between px-4 md:px-6 text-xs text-gray-500 select-none z-20">
      {/* 左侧：统计信息 */}
      <div className="flex items-center space-x-3 md:space-x-6">
        <span className="flex items-center font-medium text-gray-400">
          <AlignJustify size={14} className="mr-2 text-gray-300 transform rotate-90" />
          <span className="hidden xs:inline">字数：</span>
          {charCount.toLocaleString()}
        </span>
        <span className="hidden sm:flex items-center font-medium text-gray-400">
          <Clock size={14} className="mr-2 text-gray-300" />
          约 {readingTime} 分钟
        </span>
      </div>

      {/* 右侧：阅读位置 + 字体控制 */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleReadingMemory}
          className={`flex items-center rounded-lg border px-2 py-1.5 transition-colors ${
            readingMemoryEnabled
              ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title={
            readingMemoryEnabled
              ? '已开启：切换章节或刷新页面后自动回到上次阅读的位置。点击关闭'
              : '开启后记住每章读到/编辑到的位置，切换章节或刷新页面时自动恢复'
          }
        >
          {readingMemoryEnabled ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          <span className="ml-1.5 hidden sm:inline text-xs font-medium">
            {readingMemoryEnabled ? '记忆位置' : '记忆位置关'}
          </span>
        </button>

        <span className="hidden sm:inline text-gray-400 text-xs mr-1">字体：</span>
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={onDecreaseFontSize}
            disabled={!canDecrease}
            className={`p-1.5 transition-colors ${
              canDecrease
                ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-800'
                : 'opacity-30 cursor-not-allowed text-gray-400'
            }`}
            title="减小字体 (Ctrl + -)"
          >
            <Minus size={14} />
          </button>

          <span className="px-2 text-xs font-medium text-gray-700 border-x border-gray-200 min-w-[3rem] text-center">
            <span className="hidden sm:inline">{FONT_SIZE_LABEL[fontSize]}</span>
            <Type size={14} className="sm:hidden inline" />
          </span>

          <button
            onClick={onIncreaseFontSize}
            disabled={!canIncrease}
            className={`p-1.5 transition-colors ${
              canIncrease
                ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-800'
                : 'opacity-30 cursor-not-allowed text-gray-400'
            }`}
            title="增大字体 (Ctrl + +)"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorStatusBar;
