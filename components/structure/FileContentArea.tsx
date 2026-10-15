import React, { useMemo, useState } from 'react';
import { 
  ChevronRight, Save, Trash2, Download, Edit2, FileImage, 
  FolderOpen, Eye, Info, FileCode, SlidersHorizontal, Check, X, ArrowLeft
} from 'lucide-react';
import { FileNode } from './types';
import { Chapter, ExtraFile } from '../../types';

// Helper to format bytes
const formatSize = (bytes: number | undefined) => {
    if (bytes === undefined) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const LineNumbers = ({ count }: { count: number }) => {
    return (
        <div className="flex flex-col text-right pr-2 select-none text-gray-400 font-mono text-[11px] leading-[20px] bg-gray-50 py-2 min-h-full border-r border-gray-200 dark:text-gray-500 dark:bg-gray-900 dark:border-gray-800">
            {Array.from({ length: count }).map((_, i) => (
                <span key={i} className="h-[20px] leading-[20px] block">{i + 1}</span>
            ))}
        </div>
    );
};

interface FileContentAreaProps {
    selectedNode: FileNode | null;
    selectedNodeId: string | null;
    breadcrumbs: FileNode[] | null;
    isDirty: boolean;
    editorContent: string;
    setEditorContent: (val: string) => void;
    setIsDirty: (val: boolean) => void;
    previewUrl: string | null;
    onSave: () => void;
    onDelete: (id: string) => void;
    onRename: () => void;
    onDownload: () => void;
    onToggleActive: () => void;
    chapters?: Chapter[];
    onUpdateFile?: (id: string, updates: Partial<ExtraFile>) => void;
    /** 移动端：返回文件列表（清空选中项） */
    onMobileBack?: () => void;
}

const FileContentArea: React.FC<FileContentAreaProps> = ({
    selectedNode, selectedNodeId, breadcrumbs, isDirty, 
    editorContent, setEditorContent, setIsDirty, previewUrl,
    onSave, onDelete, onRename, onDownload, onToggleActive,
    chapters = [], onUpdateFile, onMobileBack
}) => {
    const lineCount = useMemo(() => editorContent.split('\n').length, [editorContent]);
    const [previewChapterId, setPreviewChapterId] = useState<string>('default');
    const [showScopeModal, setShowScopeModal] = useState(false);

    if (!selectedNode) {
        return (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center bg-gray-50 h-full dark:text-gray-500 dark:bg-gray-900">
                  <FolderOpen size={28} className="text-gray-300 mb-2 dark:text-gray-600" />
                  <h3 className="text-[13px] font-semibold text-gray-500 dark:text-gray-400">未选择文件</h3>
                  <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">
                      请从左侧资源管理器中选择一个文件，以查看、编辑或管理文件内容
                  </p>
              </div>
        );
    }

    const getPreviewHtml = () => {
        let bodyContent = '';
        if (previewChapterId === 'default') {
            bodyContent = `
                <div class="preview-card">
                    <h1>示例章节标题</h1>
                    <p>这是一段示例文本。您可以通过左侧的编辑器实时修改这段文字的样式（如字体颜色、行高、缩进等）。</p>
                    <p>
                        这里展示了 <strong>加粗文本(Bold)</strong>、<em>斜体文本(Italic)</em>、<u>下划线(Underline)</u> 以及 <s>删除线(Strikethrough)</s>。
                        此外，这是一个 <a href="#">超链接示例</a>。
                    </p>
                    <blockquote>
                        “这是一个引用块 (blockquote)。通常用于引用他人的话语或突出显示一段文字。”
                    </blockquote>
                    <hr />
                    <p>下方是图片示例（带图注）：</p>
                    <div style="background:#f0f0f0;height:100px;display:flex;align-items:center;justify-content:center;color:#aaa;border:2px dashed #ccc;margin:1em auto;border-radius:4px;">
                        [图片占位区域]
                    </div>
                    <p class="caption">图1.1 示例图片说明文字</p>
                    <ul>
                        <li>列表项一</li>
                        <li>列表项二</li>
                    </ul>
                </div>`;
        } else {
            const chapter = chapters.find(c => c.id === previewChapterId);
            if (chapter) {
                bodyContent = `<div class="chapter-content">${chapter.content}</div>`;
            } else {
                bodyContent = '<p>章节未找到</p>';
            }
        }

        return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>
            body { padding: 20px; font-family: sans-serif; background: #fff; color: #333; line-height: 1.6; }
            .preview-card { border: 1px solid #eee; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            img { max-width: 100%; height: auto; }
            ${editorContent}
        </style></head><body>${bodyContent}</body></html>`;
    };

    const handleToggleTargetChapter = (chapterId: string) => {
        if (!onUpdateFile || !selectedNodeId) return;
        
        const currentTargets = selectedNode.targetChapterIds || [];
        const isSelected = currentTargets.includes(chapterId);
        let newTargets: string[];
        
        if (isSelected) {
            newTargets = currentTargets.filter(id => id !== chapterId);
        } else {
            newTargets = [...currentTargets, chapterId];
        }
        
        onUpdateFile(selectedNodeId, { targetChapterIds: newTargets });
    };

    const handleToggleAllChapters = () => {
        if (!onUpdateFile || !selectedNodeId) return;
        
        const currentTargets = selectedNode.targetChapterIds || [];
        if (currentTargets.length === chapters.length) {
             onUpdateFile(selectedNodeId, { targetChapterIds: [] });
        } else {
             onUpdateFile(selectedNodeId, { targetChapterIds: chapters.map(c => c.id) });
        }
    };

    // Calculate scope display text
    const getScopeLabel = () => {
        if (!selectedNode.targetChapterIds || selectedNode.targetChapterIds.length === 0) {
            return { text: "应用到: 未指定", color: "text-gray-400 dark:text-gray-500" };
        }
        if (selectedNode.targetChapterIds.length === chapters.length) {
            return { text: "应用到: 全局 (所有章节)", color: "text-orange-600 dark:text-orange-400" };
        }
        return { text: `应用到: ${selectedNode.targetChapterIds.length} 个章节`, color: "text-orange-600 dark:text-gray-300" };
    };

    const scopeInfo = getScopeLabel();

    return (
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden relative dark:bg-gray-900">
            {/* Header Toolbar */}
            <div className="h-10 border-b border-gray-200 bg-white flex items-center justify-between px-3 flex-shrink-0 z-20 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center space-x-2 overflow-hidden mr-3">
                    {/* 移动端：返回文件列表（列表与内容同一屏放不下，改成两屏切换）*/}
                    {onMobileBack && (
                        <button
                            onClick={onMobileBack}
                            className="md:hidden h-7 w-7 -ml-1 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800"
                            title="返回文件列表"
                            aria-label="返回文件列表"
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    {/* Breadcrumbs */}
                    <div className="flex items-center text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis dark:text-gray-400">
                        {breadcrumbs?.map((node, i) => (
                            <React.Fragment key={node.id}>
                                {i > 0 && <ChevronRight size={12} className="mx-1 text-gray-300 flex-shrink-0 dark:text-gray-600"/>}
                                <span className={`transition-colors ${i === breadcrumbs.length - 1 ? 'font-semibold text-orange-600 dark:text-gray-300' : ''}`}>
                                    {node.name}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>

                    {isDirty && (
                        <span className="flex-shrink-0 flex items-center text-[11px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-sm border border-orange-200 dark:text-orange-300 dark:bg-orange-950 dark:border-orange-800">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1"></span>
                            未保存
                        </span>
                    )}

                    {selectedNode.fileType === 'css' && selectedNodeId?.startsWith('extra-') && (
                        <>
                            <div className="h-4 w-px bg-gray-200 mx-1 dark:bg-gray-700"></div>
                            <div className="flex items-center flex-shrink-0 gap-2">
                                {/* Enable/Disable switch */}
                                <label className="flex items-center cursor-pointer group select-none" title="启用/禁用此 CSS 文件">
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only" checked={selectedNode.isActive} onChange={onToggleActive} />
                                        <div className={`w-8 h-4 rounded-full transition-colors ${selectedNode.isActive ? 'bg-orange-600 dark:bg-gray-600' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${selectedNode.isActive ? 'translate-x-4' : ''}`}></div>
                                    </div>
                                    <span className={`ml-1.5 text-[11px] transition-colors ${selectedNode.isActive ? 'text-orange-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {selectedNode.isActive ? '已启用' : '已禁用'}
                                    </span>
                                </label>

                                {/* Scope button */}
                                <button
                                    onClick={() => setShowScopeModal(true)}
                                    className="flex items-center h-7 bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 px-2 rounded-md transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-700 dark:hover:border-gray-600"
                                    title="点击配置应用范围"
                                >
                                    <SlidersHorizontal size={12} className="text-gray-400 group-hover:text-orange-500 mr-1.5 dark:text-gray-500 dark:group-hover:text-gray-300"/>
                                    <span className={`text-[11px] ${scopeInfo.color}`}>
                                        {scopeInfo.text}
                                    </span>
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Toolbar actions */}
                <div className="flex items-center space-x-1">
                    {selectedNode.canRename && (
                        <button onClick={onRename} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-orange-600 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800" title="重命名">
                            <Edit2 size={14}/>
                        </button>
                    )}
                    <button onClick={onDownload} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-orange-600 hover:bg-gray-100 rounded-md transition-colors dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800" title="下载文件">
                        <Download size={14}/>
                    </button>
                    {selectedNode.canDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(selectedNode.id);
                            }}
                            className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-950"
                            title="删除文件"
                        >
                            <Trash2 size={14}/>
                        </button>
                    )}
                    {(isDirty || selectedNode.isEditable) && (
                        <button
                            onClick={onSave}
                            disabled={!isDirty}
                            className={`ml-1 h-7 flex items-center px-2.5 rounded-md text-xs font-medium transition-colors ${
                                isDirty
                                ? 'bg-orange-600 text-white hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                            }`}
                        >
                            <Save size={13} className="mr-1.5" /> 保存
                        </button>
                    )}
                </div>
            </div>

            {/* Scope Configuration Modal */}
            {showScopeModal && selectedNode.fileType === 'css' && selectedNodeId?.startsWith('extra-') && (
                <div className="absolute inset-0 z-50 bg-black/30 flex items-start justify-center pt-16" onClick={() => setShowScopeModal(false)}>
                    <div className="bg-white rounded-md border border-gray-200 w-full max-w-lg overflow-hidden flex flex-col m-4 max-h-[80vh] dark:bg-gray-900 dark:border-gray-800" onClick={e => e.stopPropagation()}>
                         <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center dark:border-gray-800">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal size={14} className="text-gray-400 dark:text-gray-500"/>
                                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">CSS 应用范围设置</h3>
                            </div>
                            <button onClick={() => setShowScopeModal(false)} className="text-gray-400 hover:text-gray-600 p-0.5 rounded-sm dark:text-gray-500 dark:hover:text-gray-300" title="关闭">
                                <X size={14}/>
                            </button>
                         </div>

                         <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-[11px] text-gray-500 leading-relaxed dark:text-gray-400">
                                勾选此 CSS 需要生效的章节。未被选中的章节将不会加载此样式表。
                            </p>
                         </div>

                         <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            <label className="flex items-center px-2 py-1.5 rounded-sm hover:bg-gray-50 cursor-pointer border border-gray-200 mb-2 transition-colors group dark:hover:bg-gray-800 dark:border-gray-700">
                                <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-2 transition-colors ${selectedNode.targetChapterIds?.length === chapters.length ? 'bg-orange-600 border-orange-600 dark:bg-gray-600 dark:border-gray-600' : 'border-gray-300 bg-white group-hover:border-orange-400 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-gray-600'}`}>
                                     {selectedNode.targetChapterIds?.length === chapters.length && <Check size={11} className="text-white"/>}
                                </div>
                                <input type="checkbox" className="hidden" checked={selectedNode.targetChapterIds?.length === chapters.length} onChange={handleToggleAllChapters} />
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">全选 (全局应用)</span>
                            </label>

                            <div className="space-y-0.5">
                                {chapters.map(chapter => {
                                    const effectivelyChecked = selectedNode.targetChapterIds?.includes(chapter.id);

                                    return (
                                        <label key={chapter.id} className="flex items-center px-2 py-1.5 rounded-sm hover:bg-gray-50 cursor-pointer transition-colors group dark:hover:bg-gray-800">
                                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center mr-2 transition-colors ${effectivelyChecked ? 'bg-orange-600 border-orange-600 dark:bg-gray-600 dark:border-gray-600' : 'border-gray-300 bg-white group-hover:border-orange-400 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-gray-600'}`}>
                                                 {effectivelyChecked && <Check size={11} className="text-white"/>}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={!!effectivelyChecked}
                                                onChange={() => handleToggleTargetChapter(chapter.id)}
                                            />
                                            <span className="text-xs text-gray-600 truncate select-none flex-1 dark:text-gray-400">{chapter.title}</span>
                                            {effectivelyChecked && <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-sm dark:text-gray-200 dark:bg-gray-700">生效</span>}
                                        </label>
                                    );
                                })}
                            </div>
                         </div>

                         <div className="px-3 py-2 border-t border-gray-200 flex justify-end dark:border-gray-800">
                             <button onClick={() => setShowScopeModal(false)} className="h-7 px-3 bg-orange-600 text-white text-xs font-medium rounded-md hover:bg-orange-700 transition-colors dark:bg-gray-600 dark:hover:bg-gray-500">
                                 完成配置
                             </button>
                         </div>
                    </div>
                </div>
            )}

            {/* Editor / Preview Area */}
            <div className="flex-1 flex overflow-hidden">
                {selectedNode.isEditable ? (
                    <>
                        {/* Editor area */}
                        <div className="flex-1 relative flex bg-white dark:bg-gray-900">
                            <LineNumbers count={lineCount || 1} />
                            <textarea
                                className="flex-1 w-full h-full px-3 py-2 font-mono text-[13px] leading-[20px] bg-white text-gray-800 resize-none focus:outline-none custom-scrollbar selection:bg-orange-100 dark:bg-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 dark:selection:bg-gray-700"
                                spellCheck={false}
                                value={editorContent}
                                onChange={(e) => {
                                    setEditorContent(e.target.value);
                                    setIsDirty(true);
                                }}
                                placeholder="在此输入代码..."
                            />
                        </div>
                        {selectedNode.fileType === 'css' && selectedNodeId?.startsWith('extra-') && (
                            <div className="w-[35%] border-l border-gray-200 bg-white flex flex-col z-10 hidden lg:flex dark:border-gray-800 dark:bg-gray-900">
                                {/* Preview header */}
                                <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800">
                                     <div className="flex items-center text-xs font-semibold text-gray-600 dark:text-gray-400">
                                        <Eye size={13} className="text-gray-400 mr-1.5 dark:text-gray-500" />
                                        <span>实时预览</span>
                                     </div>
                                </div>

                                <div className="flex-1 overflow-hidden relative bg-gray-50 dark:bg-gray-900">
                                        {selectedNode.isActive ? (
                                            <div className="flex flex-col h-full">
                                                <div className="px-2 py-1.5 border-b border-gray-200 bg-white flex items-center justify-between dark:border-gray-800 dark:bg-gray-900">
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">选择预览底本:</span>
                                                    <select
                                                        value={previewChapterId}
                                                        onChange={(e) => setPreviewChapterId(e.target.value)}
                                                        className="h-7 text-xs border border-gray-200 rounded-md bg-white px-2 focus:ring-1 focus:ring-orange-500 outline-none max-w-[150px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                                    >
                                                        <option value="default">默认示例</option>
                                                        <optgroup label="项目章节">
                                                            {chapters.map(c => (
                                                                <option key={c.id} value={c.id}>{c.title}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <iframe
                                                        title="CSS Live Preview"
                                                        className="w-full h-full border-none"
                                                        srcDoc={getPreviewHtml()}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-gray-900">
                                                <Info size={20} className="text-gray-300 mb-2 dark:text-gray-600"/>
                                                <h3 className="text-xs font-semibold text-gray-500 mb-1 dark:text-gray-400">样式已禁用</h3>
                                                <p className="text-[11px] text-gray-400 leading-relaxed max-w-[200px] dark:text-gray-500">
                                                    请先启用此文件以查看预览效果
                                                </p>
                                            </div>
                                        )}
                                </div>
                            </div>
                        )}
                        {/* Fallback for style.css which is global */}
                        {selectedNode.fileType === 'css' && selectedNodeId === 'style-css' && (
                             <div className="w-[35%] border-l border-gray-200 bg-white flex flex-col z-10 hidden lg:flex dark:border-gray-800 dark:bg-gray-900">
                                <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between dark:bg-gray-900 dark:border-gray-800">
                                    <div className="flex items-center text-xs font-semibold text-gray-600 dark:text-gray-400">
                                        <Eye size={13} className="text-gray-400 mr-1.5 dark:text-gray-500" />
                                        <span>全局样式预览</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden relative">
                                    <iframe
                                        title="CSS Live Preview"
                                        className="w-full h-full border-none"
                                        srcDoc={getPreviewHtml()}
                                    />
                                </div>
                             </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 h-full overflow-hidden relative dark:bg-gray-900">
                         {previewUrl ? (
                              <div className="flex flex-col items-center justify-center w-full h-full p-6">
                                   <div className="bg-white p-2 rounded-md border border-gray-200 max-h-full max-w-full overflow-auto dark:bg-gray-800 dark:border-gray-700">
                                      <img src={previewUrl} alt="Preview" className="max-w-full max-h-[60vh] object-contain rounded-sm" />
                                   </div>
                                   <div className="mt-4 bg-white px-3 py-2 rounded-md border border-gray-200 flex items-center space-x-2 dark:bg-gray-800 dark:border-gray-700">
                                       <FileImage size={16} className="text-orange-500"/>
                                       <div className="flex flex-col text-left">
                                           <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{selectedNode.name}</span>
                                           <span className="text-[11px] text-gray-400 font-mono dark:text-gray-500">{formatSize(selectedNode.sizeBytes)}</span>
                                       </div>
                                   </div>
                              </div>
                         ) : (
                              <div className="bg-white p-6 rounded-md border border-gray-200 max-w-md text-center dark:bg-gray-800 dark:border-gray-700">
                                <FileCode size={24} className="text-gray-300 mx-auto mb-3 dark:text-gray-600" />
                                <h3 className="font-semibold text-gray-700 text-[13px] dark:text-gray-300">{selectedNode.name}</h3>
                                <p className="text-[11px] text-gray-500 leading-relaxed mt-2 mb-4 dark:text-gray-400">
                                    此文件为系统自动生成的标准文件（{selectedNode.fileType?.toUpperCase()}）。
                                    它将包含项目的元数据或目录结构，不支持直接编辑。
                                </p>
                                <button onClick={onDownload} className="h-7 px-3 bg-orange-600 text-white text-xs font-medium rounded-md hover:bg-orange-700 transition-colors dark:bg-gray-600 dark:hover:bg-gray-500">
                                    下载以查看内容
                                </button>
                              </div>
                         )}
                    </div>
                )}
            </div>
      </div>
    );
};

export default FileContentArea;