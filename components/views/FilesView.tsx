import React, { useState } from 'react';
import { Settings2, Library, BookOpen, FileType, Cloud, X, ChevronUp, ChevronDown, FileCode } from 'lucide-react';
import { Chapter, ProjectData } from '../../types';
import { mergeProjects, parseFileToProject } from '../../services/importFile';
import { dialog } from '../../services/dialog';

interface FilesViewProps {
    onProjectUpdate: (updates: Partial<ProjectData>) => void;
    onChaptersLoaded: (chapters: Chapter[], firstChapterId: string) => void;
    onLoadingStart: (msg: string) => void;
    onLoadingEnd: () => void;
}

type DragZoneType = 'txt' | 'epub' | 'html' | 'batch' | null;

const FilesView: React.FC<FilesViewProps> = ({ onProjectUpdate, onChaptersLoaded, onLoadingStart, onLoadingEnd }) => {
    const [splitRegex, setSplitRegex] = useState<string>("^\\s*(Chapter\\s+\\d+|第[0-9一二三四五六七八九十百千]+[章回节]|序章|尾声|引子|[（(][0-9一二三四五六七八九十百千]+[)）])");
    const [cleanHtml, setCleanHtml] = useState(true);
    const [removeImages, setRemoveImages] = useState(false);
    const [showSplitSettings, setShowSplitSettings] = useState(false);
    const [dragActive, setDragActive] = useState<DragZoneType>(null);
    const [batchFiles, setBatchFiles] = useState<File[]>([]);
    const [primaryFileIndex, setPrimaryFileIndex] = useState<number>(0);
    const [showBatchModal, setShowBatchModal] = useState<boolean>(false);

    // --- Processing Logic ---
    // 解析统一走 services/importFile，与「书籍管理 → 导入新书」共用同一套逻辑，
    // 避免同一个文件在两个入口导入出不同结果。

    /**
     * 把解析结果覆盖到当前书籍。
     *
     * 这里是「替换当前书内容」的语义（不是新建一本书）：
     * 解析出的完整数据整体覆盖，并清掉自定义目录 —— 目录是跟着章节走的，
     * 章节都换了，旧的目录内容不应残留。
     */
    const applyImportedProject = (project: ProjectData, firstChapterId?: string) => {
        onProjectUpdate({ ...project, customTocTitle: undefined, customTocXhtml: undefined });
        if (firstChapterId && project.chapters?.length) {
            onChaptersLoaded(project.chapters, firstChapterId);
        }
    };

    const processSingleFile = async (file: File) => {
        onLoadingStart(`正在解析 ${file.name}...`);
        try {
            const { project } = await parseFileToProject(file, {
                cleanHtml,
                removeImages,
                splitRegex,
            });
            applyImportedProject(project, project.chapters?.[0]?.id);
        } catch (error) {
            console.error('导入失败', error);
            await dialog.alert(error instanceof Error ? error.message : '文件解析失败');
        } finally {
            onLoadingEnd();
        }
    };

    const processTxtFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.txt')) {
            await dialog.alert('请上传 .txt 格式的文件');
            return;
        }
        await processSingleFile(file);
    };

    const processEpubFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.epub')) {
            await dialog.alert('请上传 .epub 格式的文件');
            return;
        }
        await processSingleFile(file);
    };

    const processHtmlFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
            await dialog.alert('请上传 .html 或 .htm 格式的文件');
            return;
        }
        await processSingleFile(file);
    };

    const handleShowBatchOptions = async (files: FileList | File[]) => {
        const epubFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.epub'));
        if (epubFiles.length === 0) {
            await dialog.alert('请选择至少一个 .epub 文件');
            return;
        }

        const sortedFiles = epubFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        setBatchFiles(sortedFiles);
        setPrimaryFileIndex(0);
        setShowBatchModal(true);
    };

    const handleMoveBatchFile = (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === batchFiles.length - 1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        const newBatchFiles = [...batchFiles];
        // Swap elements
        const temp = newBatchFiles[index];
        newBatchFiles[index] = newBatchFiles[newIndex];
        newBatchFiles[newIndex] = temp;

        // Adjust primaryFileIndex if it's affected
        if (primaryFileIndex === index) {
            setPrimaryFileIndex(newIndex);
        } else if (primaryFileIndex === newIndex) {
            setPrimaryFileIndex(index);
        }

        setBatchFiles(newBatchFiles);
    };

    const processBatchFiles = async (fileList: File[], primaryIndex: number) => {
        onLoadingStart(`准备合并 ${fileList.length} 本书籍...`);

        try {
            // 逐本解析成完整 ProjectData，再由 mergeProjects 统一合并：
            // 图片续号与正文里 data-id 的同步重写都在那里，各写一份极易漏改。
            const entries: Array<{ project: ProjectData; label: string }> = [];

            for (let i = 0; i < fileList.length; i++) {
                onLoadingStart(`正在合并第 ${i + 1}/${fileList.length} 本书: ${fileList[i].name}`);
                // 让出主线程，保证进度提示能刷新
                await new Promise((resolve) => setTimeout(resolve, 10));

                const file = fileList[i];
                const { project } = await parseFileToProject(file, { cleanHtml, removeImages });
                entries.push({ project, label: file.name });
            }

            const merged = mergeProjects(entries, primaryIndex);
            const primaryTitle = entries[primaryIndex]?.project.metadata?.title?.trim();

            applyImportedProject(
                {
                    ...merged,
                    customTocTitle: fileList.length > 1 ? '目录' : undefined,
                    metadata: entries.length > 1 && !primaryTitle
                        ? { ...merged.metadata, title: '合并书籍合集' }
                        : merged.metadata,
                },
                merged.chapters?.[0]?.id,
            );
        } catch (error) {
            console.error("Batch merge failed:", error);
            await dialog.alert(`批量合并失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            onLoadingEnd();
        }
    };

    // --- Input Change Handlers ---

    const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processTxtFile(file);
        e.target.value = ''; // Clear input to allow re-uploading the same file
    };

    const handleEpubUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processEpubFile(file);
        e.target.value = ''; // Clear input
    };

    const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processHtmlFile(file);
        e.target.value = ''; // Clear input
    };

    const handleBatchEpubUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) handleShowBatchOptions(files);
        e.target.value = ''; // Clear input
    };

    // --- Drag & Drop Handlers ---

    const handleDragEnter = (e: React.DragEvent, zone: DragZoneType) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(zone);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only clear if we are leaving the current target container, not entering a child
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragActive(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent, zone: DragZoneType) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(null);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            if (zone === 'txt') {
                processTxtFile(files[0]);
            } else if (zone === 'epub') {
                processEpubFile(files[0]);
            } else if (zone === 'html') {
                processHtmlFile(files[0]);
            } else if (zone === 'batch') {
                handleShowBatchOptions(files);
            }
        }
    };

    return (
        <div className="flex h-full flex-col bg-gray-50 overflow-hidden dark:bg-gray-900">
            {/* 紧凑工具栏 */}
            <div className="flex-none border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">文件导入</h1>
                    <span className="text-xs text-gray-400 dark:text-gray-500">解析并将内容替换到当前书籍</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {/* 四个导入入口 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {/* TXT Import */}
                    <label
                        className={`relative block w-full cursor-pointer rounded-md border transition-colors ${
                            dragActive === 'txt'
                                ? 'border-gray-400 ring-2 ring-gray-300 dark:border-gray-500 dark:ring-gray-600'
                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700'
                        }`}
                        onDragEnter={(e) => handleDragEnter(e, 'txt')}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'txt')}
                    >
                        <input type="file" accept=".txt" onChange={handleTxtUpload} className="hidden" />
                        <div className="flex h-16 items-center gap-2.5 rounded-md bg-gray-50 px-3 dark:bg-gray-950">
                            {dragActive === 'txt'
                                ? <Cloud size={18} className="flex-none text-gray-900 animate-bounce dark:text-gray-100" />
                                : <FileType size={18} className="flex-none text-gray-900 dark:text-gray-100" />}
                            <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">导入 TXT</div>
                                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                    {dragActive === 'txt' ? '释放以导入' : '自动切分章节'}
                                </div>
                            </div>
                        </div>
                    </label>

                    {/* Single EPUB Import */}
                    <label
                        className={`relative block w-full cursor-pointer rounded-md border transition-colors ${
                            dragActive === 'epub'
                                ? 'border-orange-400 ring-2 ring-orange-300 dark:border-gray-600 dark:ring-gray-700'
                                : 'border-orange-200 hover:border-orange-300 dark:border-gray-700 dark:hover:border-gray-600'
                        }`}
                        onDragEnter={(e) => handleDragEnter(e, 'epub')}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'epub')}
                    >
                        <input type="file" accept=".epub" onChange={handleEpubUpload} className="hidden" />
                        <div className="flex h-16 items-center gap-2.5 rounded-md bg-orange-50 px-3 dark:bg-gray-700">
                            {dragActive === 'epub'
                                ? <Cloud size={18} className="flex-none text-orange-600 animate-bounce dark:text-gray-300" />
                                : <BookOpen size={18} className="flex-none text-orange-600 dark:text-gray-300" />}
                            <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-orange-700 dark:text-gray-200">导入 EPUB</div>
                                <div className="truncate text-[11px] text-orange-600/70 dark:text-gray-300/70">
                                    {dragActive === 'epub' ? '释放以解析' : '解析现有电子书'}
                                </div>
                            </div>
                        </div>
                    </label>

                    {/* HTML Import */}
                    <label
                        className={`relative block w-full cursor-pointer rounded-md border transition-colors ${
                            dragActive === 'html'
                                ? 'border-orange-400 ring-2 ring-orange-300 dark:border-orange-500 dark:ring-orange-800'
                                : 'border-orange-200 hover:border-orange-300 dark:border-orange-800 dark:hover:border-orange-700'
                        }`}
                        onDragEnter={(e) => handleDragEnter(e, 'html')}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'html')}
                    >
                        <input type="file" accept=".html,.htm" onChange={handleHtmlUpload} className="hidden" />
                        <div className="flex h-16 items-center gap-2.5 rounded-md bg-orange-50 px-3 dark:bg-orange-950">
                            {dragActive === 'html'
                                ? <Cloud size={18} className="flex-none text-orange-600 animate-bounce dark:text-orange-400" />
                                : <FileCode size={18} className="flex-none text-orange-600 dark:text-orange-400" />}
                            <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-orange-700 dark:text-orange-300">导入 HTML</div>
                                <div className="truncate text-[11px] text-orange-600/70 dark:text-orange-400/70">
                                    {dragActive === 'html' ? '释放以导入' : '智能识别结构'}
                                </div>
                            </div>
                        </div>
                    </label>

                    {/* Batch EPUB Merge */}
                    <label
                        className={`relative block w-full cursor-pointer rounded-md border transition-colors ${
                            dragActive === 'batch'
                                ? 'border-orange-400 ring-2 ring-orange-300 dark:border-gray-600 dark:ring-gray-700'
                                : 'border-orange-200 hover:border-orange-300 dark:border-gray-700 dark:hover:border-gray-600'
                        }`}
                        onDragEnter={(e) => handleDragEnter(e, 'batch')}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'batch')}
                    >
                        <input type="file" accept=".epub" multiple onChange={handleBatchEpubUpload} className="hidden" />
                        <div className="flex h-16 items-center gap-2.5 rounded-md bg-orange-50 px-3 dark:bg-gray-700">
                            {dragActive === 'batch'
                                ? <Cloud size={18} className="flex-none text-orange-600 animate-bounce dark:text-gray-300" />
                                : <Library size={18} className="flex-none text-orange-600 dark:text-gray-300" />}
                            <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-orange-700 dark:text-gray-200">批量合并</div>
                                <div className="truncate text-[11px] text-orange-600/70 dark:text-gray-300/70">
                                    {dragActive === 'batch' ? '释放以批量合并' : '多卷合一模式'}
                                </div>
                            </div>
                        </div>
                    </label>
                </div>

                {/* 解析选项：紧凑设置区 */}
                <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    <button
                        onClick={() => setShowSplitSettings(!showSplitSettings)}
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-orange-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    >
                        <Settings2 size={14} />
                        {showSplitSettings ? '收起高级设置' : '高级导入设置'}
                        <ChevronDown
                            size={14}
                            className={`ml-auto text-gray-400 transition-transform dark:text-gray-500 ${showSplitSettings ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {showSplitSettings && (
                        <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                TXT 章节切分正则 (Regex)
                            </label>
                            <div className="mt-1.5 flex flex-col gap-2 md:flex-row">
                                <input
                                    type="text"
                                    className="h-7 w-full flex-1 rounded-md border border-gray-200 bg-white px-2 font-mono text-xs text-orange-600 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                    value={splitRegex}
                                    onChange={(e) => setSplitRegex(e.target.value)}
                                />
                                <button onClick={() => setSplitRegex("^\\s*(Chapter\\s+\\d+|第[0-9一二三四五六七八九十百千]+[章回节]|序章|尾声|引子|[（(][0-9一二三四五六七八九十百千]+[)）])")} className="h-7 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">恢复默认</button>
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">系统将使用此规则扫描 TXT 文件并创建新章节。</p>
                        </div>
                    )}

                    <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">EPUB 解析选项</label>
                        <div className="mt-1.5 divide-y divide-gray-100 dark:divide-gray-800">
                            <label className="group flex cursor-pointer items-start gap-2 py-1.5">
                                <input type="checkbox" checked={cleanHtml} onChange={e => setCleanHtml(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-gray-300 text-orange-600 transition-colors focus:ring-orange-500 dark:border-gray-600" />
                                <div className="min-w-0 text-left text-xs">
                                    <span className="font-medium text-gray-700 transition-colors group-hover:text-orange-600 dark:text-gray-300 dark:group-hover:text-gray-300">清洗旧版 HTML 格式</span>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">强力移除无用的 {`<br>, <span>, <style>`} 等多余标签，使导入的内容更加纯净。</p>
                                </div>
                            </label>
                            <label className="group flex cursor-pointer items-start gap-2 py-1.5">
                                <input type="checkbox" checked={removeImages} onChange={e => setRemoveImages(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-gray-300 text-orange-600 transition-colors focus:ring-orange-500 dark:border-gray-600" />
                                <div className="min-w-0 text-left text-xs">
                                    <span className="font-medium text-gray-700 transition-colors group-hover:text-orange-600 dark:text-gray-300 dark:group-hover:text-gray-300">移除章节内页原配图片</span>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">解决某些旧电子书每一章开头都带一张相同的超巨大封面，导致文件体积爆炸的问题。</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Batch Merge Options Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">批量合并选项</h3>
                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">请选择一本主书，合并后将使用该书的封面和元数据。</p>
                            </div>
                            <button onClick={() => setShowBatchModal(false)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto p-2">
                            {batchFiles.map((file, idx) => (
                                <label key={idx} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${primaryFileIndex === idx ? 'border-orange-300 bg-orange-50 dark:border-gray-600 dark:bg-gray-800' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700'}`}>
                                    <input
                                        type="radio"
                                        name="primaryBook"
                                        checked={primaryFileIndex === idx}
                                        onChange={() => setPrimaryFileIndex(idx)}
                                        className="h-3.5 w-3.5 shrink-0 border-gray-300 text-orange-600 focus:ring-orange-500 dark:border-gray-600"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className={`truncate text-[13px] font-medium ${primaryFileIndex === idx ? 'text-orange-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{file.name}</p>
                                    </div>
                                    {primaryFileIndex === idx && <span className="flex-none rounded-sm bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-gray-700 dark:text-gray-200">主书本</span>}

                                    <div className="flex flex-none items-center gap-0.5 border-l border-gray-100 pl-1.5 dark:border-gray-800">
                                        <button
                                            type="button"
                                            onClick={(e) => handleMoveBatchFile(idx, 'up', e)}
                                            disabled={idx === 0}
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${idx === 0 ? 'cursor-not-allowed opacity-20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}`}
                                            title="上移"
                                        >
                                            <ChevronUp size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleMoveBatchFile(idx, 'down', e)}
                                            disabled={idx === batchFiles.length - 1}
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${idx === batchFiles.length - 1 ? 'cursor-not-allowed opacity-20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}`}
                                            title="下移"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                            <button
                                onClick={() => setShowBatchModal(false)}
                                className="inline-flex h-7 items-center rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    setShowBatchModal(false);
                                    processBatchFiles(batchFiles, primaryFileIndex);
                                }}
                                className="inline-flex h-7 items-center rounded-md bg-orange-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500"
                            >
                                开始合并
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FilesView;
