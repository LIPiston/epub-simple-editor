import React from 'react';
import { Folder, FolderOpen, FileText, FileCode, FileImage, File, ChevronRight, ChevronDown, CornerDownRight, Edit2, Trash2 } from 'lucide-react';
import { FileNode } from './types';

// Helper to format bytes
const formatSize = (bytes: number | undefined) => {
    if (bytes === undefined) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FileTreeItemProps {
    node: FileNode; 
    depth?: number; 
    selectedId: string | null;
    onSelect: (node: FileNode) => void;
    searchTerm: string;
    expandedIds: Set<string>;
    onToggleNode: (id: string) => void;
    onDelete: (node: FileNode) => void;
    onRename: (node: FileNode) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ 
    node, depth = 0, selectedId, onSelect, searchTerm, 
    expandedIds, onToggleNode, onDelete, onRename
}) => {
  // If we are searching, force expand folders that match or have matching children
  const isExpanded = node.type === 'folder' && (expandedIds.has(node.id) || !!searchTerm);

  const getIcon = () => {
    if (node.type === 'folder') return isExpanded ? <FolderOpen size={15} className="text-orange-500" /> : <Folder size={15} className="text-orange-500" />;

    switch (node.fileType) {
      case 'xhtml': return <FileText size={14} className="text-orange-500" />;
      case 'css': return <FileCode size={14} className="text-orange-500" />;
      case 'image': return <FileImage size={14} className="text-orange-500" />;
      case 'xml':
      case 'opf':
      case 'ncx': return <FileCode size={14} className="text-gray-400" />;
      default: return <File size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="select-none text-[13px] font-sans">
      <div
        className={`flex items-center py-[3px] pr-2 cursor-pointer transition-colors group relative ${
            selectedId === node.id
            ? 'bg-orange-50 text-orange-700 dark:bg-gray-700 dark:text-gray-200'
            : 'hover:bg-gray-100 text-gray-600 dark:hover:bg-gray-800 dark:text-gray-400'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={(e) => {
            e.stopPropagation();
            if (node.type === 'folder') onToggleNode(node.id);
            else onSelect(node);
        }}
      >
        {depth > 0 && (
            <div className="absolute top-0 bottom-0 border-l border-gray-200 dark:border-gray-800" style={{ left: `${depth * 14}px` }} />
        )}

        <span className="mr-1 text-gray-400 flex-shrink-0 w-3.5 flex items-center justify-center dark:text-gray-500">
          {node.type === 'folder' ? (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <CornerDownRight size={9} className="text-gray-300 -ml-1 dark:text-gray-600" />
          )}
        </span>
        <span className="mr-1.5 flex-shrink-0 flex items-center">{getIcon()}</span>
        <span className="truncate flex-1 flex items-center min-w-0">
            <span className="truncate">{node.name}</span>
            {node.fileType === 'css' && node.isActive && (
                <span className="ml-1.5 w-1.5 h-1.5 bg-orange-600 rounded-full flex-shrink-0" title="已激活"></span>
            )}
        </span>

        {/* Inline Actions (Rename/Delete)
            悬停才出现；触摸设备没有悬停，靠 .hover-reveal 保持常显 */}
        <div className={`hover-reveal flex items-center space-x-0.5 ml-1 ${selectedId === node.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
             {node.canRename && (
                 <button
                    onClick={(e) => { e.stopPropagation(); onRename(node); }}
                    className="p-0.5 text-gray-400 hover:text-orange-600 rounded-sm transition-colors dark:text-gray-500 dark:hover:text-gray-300"
                    title="重命名"
                 >
                     <Edit2 size={12} />
                 </button>
             )}
             {node.canDelete && (
                 <button
                    onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                    className="p-0.5 text-gray-400 hover:text-red-500 rounded-sm transition-colors dark:text-gray-500 dark:hover:text-red-400"
                    title="删除"
                 >
                     <Trash2 size={12} />
                 </button>
             )}
        </div>

        {node.type === 'file' && !node.canDelete && !node.canRename && (
             <span className={`ml-1.5 text-[11px] tabular-nums flex-shrink-0 ${selectedId === node.id ? 'text-orange-500 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                 {formatSize(node.sizeBytes)}
             </span>
        )}
      </div>
      {node.type === 'folder' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                searchTerm={searchTerm}
                expandedIds={expandedIds}
                onToggleNode={onToggleNode}
                onDelete={onDelete}
                onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTreeItem;