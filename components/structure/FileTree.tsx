import React from 'react';
import { FilePlus2, Search, X } from 'lucide-react';
import { FileNode } from './types';
import FileTreeItem from './FileTreeItem';

// Helper to format bytes
const formatSize = (bytes: number | undefined) => {
    if (bytes === undefined) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FileTreeProps {
    displayedNodes: FileNode[];
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    totalSize: number;
    onAddFile: () => void;
    expandedIds: Set<string>;
    onToggleNode: (id: string) => void;
    onDelete: (node: FileNode) => void;
    onRename: (node: FileNode) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
    displayedNodes, selectedNodeId, setSelectedNodeId,
    searchTerm, setSearchTerm, totalSize, onAddFile,
    expandedIds, onToggleNode, onDelete, onRename
}) => {
    return (
      <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col flex-shrink-0 z-10 dark:bg-gray-900 dark:border-gray-800">
          {/* Toolbar: title + count + search + new */}
          <div className="px-3 py-2 border-b border-gray-200 space-y-2 flex-shrink-0 dark:border-gray-800">
              <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300">资源管理器</h2>
                  <span className="text-[11px] text-gray-400 tabular-nums dark:text-gray-500">{displayedNodes.length} 项</span>
              </div>

              <div className="relative">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="搜索文件或文件夹..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-7 pl-7 pr-7 bg-white border border-gray-200 rounded-md text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-gray-700"
                  />
                  {searchTerm && (
                      <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-sm dark:text-gray-500 dark:hover:text-gray-300"
                          title="清除搜索"
                      >
                          <X size={12} />
                      </button>
                  )}
              </div>

              <button
                  onClick={onAddFile}
                  className="w-full h-7 flex items-center justify-center gap-1.5 border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-md text-xs font-medium transition-colors dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-400"
                  title="新建 CSS 文件"
              >
                  <FilePlus2 size={13} />
                  <span>新建 CSS 文件</span>
              </button>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
             {displayedNodes.length > 0 ? (
                 displayedNodes.map((child) => (
                    <FileTreeItem
                        key={child.id}
                        node={child}
                        selectedId={selectedNodeId}
                        onSelect={(n) => setSelectedNodeId(n.id)}
                        searchTerm={searchTerm}
                        expandedIds={expandedIds}
                        onToggleNode={onToggleNode}
                        onDelete={onDelete}
                        onRename={onRename}
                    />
                 ))
             ) : (
                 <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                     <Search size={18} className="text-gray-300 mb-2 dark:text-gray-600" />
                     <p className="text-[13px] text-gray-400 dark:text-gray-500">未找到文件</p>
                     <p className="text-[11px] text-gray-400 mt-0.5 dark:text-gray-500">尝试其他搜索关键词</p>
                 </div>
             )}
          </div>

          {/* Footer status */}
          <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between flex-shrink-0 dark:border-gray-800">
             <div className="flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                 <span className="text-[11px] text-gray-500 dark:text-gray-400">项目总大小</span>
             </div>
             <span className="text-[11px] font-mono text-gray-600 tabular-nums dark:text-gray-400">
                 {formatSize(totalSize)}
             </span>
          </div>
      </div>
    );
};

export default FileTree;