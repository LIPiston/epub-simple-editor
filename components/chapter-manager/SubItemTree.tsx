import React from 'react';
import { TocItem } from '../../types';
import { CornerDownRight } from 'lucide-react';

interface SubItemTreeProps {
  items: TocItem[];
  onClickItem: (anchorId: string) => void;
}

/**
 * 章节下的小标题列表。
 *
 * 用一条竖向缩进线表达从属关系，行本身扁平、无背景，
 * 只在悬停时给一点反馈 —— 小标题是次要信息，不该和章节行争夺注意力。
 */
const SubItemTree: React.FC<SubItemTreeProps> = ({ items, onClickItem }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="ml-[26px] border-l border-gray-200 py-0.5 pl-2 dark:border-gray-800">
      {items.map((item, index) => (
        <button
          key={item.id || `sub-${index}`}
          onClick={() => onClickItem(item.id)}
          className={`flex w-full items-center gap-1.5 rounded-sm py-[3px] pr-1.5 text-left text-[12px] leading-5 transition-colors hover:bg-gray-100 hover:text-orange-700 dark:hover:bg-gray-800 dark:hover:text-gray-300 ${
            item.level === 1 ? 'pl-1 text-gray-600 dark:text-gray-400' : 'pl-4 text-gray-500 dark:text-gray-400'
          }`}
          title={item.text}
        >
          <CornerDownRight size={11} className="shrink-0 text-gray-300 dark:text-gray-600" />
          <span className="min-w-0 flex-1 truncate">{item.text || '小节'}</span>
        </button>
      ))}
    </div>
  );
};

export default SubItemTree;
