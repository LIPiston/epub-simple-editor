import React, { useMemo, useRef, useState } from 'react';
import { Trash2, UploadCloud, Image as ImageIcon, FileText, CheckCircle2, Circle, LocateFixed, Link2, RefreshCw } from 'lucide-react';
import { Chapter, ImageAsset } from '../../types';
import { analyzeImageUsages } from '../../services/analysis/book';
import { dialog } from '../../services/dialog';
import { sanitizeFilename } from '../text-editor/editorHelpers';
import { generateImageFilename, generateNewImageFilename, renameImages, updateChapterImageReferences } from '../../utils/imageNaming';

interface ImagesViewProps {
  images: ImageAsset[];
  chapters: Chapter[];
  onUpdateImages: (images: ImageAsset[]) => void;
  onUpdateChapters?: (chapters: Chapter[]) => void;  // 🎯 新增：用于更新章节内容
  onLocateUsage: (chapterId: string, imageId: string) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getImageDetails = (file: File): Promise<Omit<ImageAsset, 'id'>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          name: file.name,
          data: dataUrl,
          type: file.type,
          dimensions: `${img.naturalWidth} x ${img.naturalHeight}`,
          size: file.size,
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const ImageCard: React.FC<{
  image: ImageAsset;
  onDelete: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  selectionMode: boolean;
  usageCount: number;
  isActive: boolean;
  onActivate: (id: string) => void;
}> = ({ image, onDelete, isSelected, onToggleSelect, selectionMode, usageCount, isActive, onActivate }) => (
  <div
    onClick={() => selectionMode ? onToggleSelect(image.id) : onActivate(image.id)}
    title={`${image.name} · ${image.dimensions} · ${formatBytes(image.size)} · ${usageCount} 章引用`}
    className={`relative group bg-white p-1 rounded-md border cursor-pointer transition-colors dark:bg-gray-900 ${isSelected
      ? 'border-orange-500 ring-1 ring-orange-500'
      : isActive
        ? 'border-orange-300 dark:border-gray-600'
        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800'
      }`}
  >
    <div className="aspect-square bg-gray-50 rounded-sm flex items-center justify-center overflow-hidden dark:bg-gray-800">
      <img src={image.data} alt={image.name} className="object-contain w-full h-full" />
    </div>

    <div className="mt-1 flex items-center gap-1 px-0.5">
      <p className="text-[11px] text-gray-600 truncate flex-1 dark:text-gray-400" title={image.name}>{image.name}</p>
      {usageCount > 0 && (
        <span
          className="shrink-0 rounded-full bg-orange-50 text-orange-600 text-[10px] leading-none px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-300"
          title={`被 ${usageCount} 个章节引用`}
        >
          {usageCount}
        </span>
      )}
    </div>

    {/* Hover detail overlay (non-selection mode) */}
    {!selectionMode && (
      <div className="absolute inset-0 rounded-md bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none p-0.5 flex flex-col justify-end">
        <div className="text-[10px] text-white/90 space-y-0.5">
          <div className="flex items-center truncate">
            <ImageIcon size={10} className="mr-1 shrink-0" /> {image.dimensions}
          </div>
          <div className="flex items-center truncate">
            <FileText size={10} className="mr-1 shrink-0" /> {formatBytes(image.size)}
          </div>
          <div className="flex items-center truncate">
            <Link2 size={10} className="mr-1 shrink-0" /> {usageCount} 章引用
          </div>
        </div>
      </div>
    )}

    {selectionMode && (
      <div className="absolute top-1 left-1 z-10">
        {isSelected ? (
          <CheckCircle2 size={18} className="text-orange-500 fill-white" />
        ) : (
          <Circle size={18} className="text-white/80 hover:text-white" />
        )}
      </div>
    )}

    {!selectionMode && (
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
        className="absolute top-1 right-1 z-10 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600"
        title="删除图片"
        aria-label="删除图片"
      >
        <Trash2 size={12} />
      </button>
    )}
  </div>
);

const SkeletonCard: React.FC = () => (
  <div className="bg-white p-1 rounded-md border border-gray-200 animate-pulse dark:bg-gray-900 dark:border-gray-800">
    <div className="aspect-square bg-gray-100 rounded-sm dark:bg-gray-700"></div>
  </div>
);

const ImagesView: React.FC<ImagesViewProps> = ({ images, chapters, onUpdateImages, onUpdateChapters, onLocateUsage }) => {
  const [dragActive, setDragActive] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUsages = useMemo(() => analyzeImageUsages(chapters, images), [chapters, images]);
  const activeUsage = imageUsages.find(item => item.image.id === activeImageId) || imageUsages[0] || null;

  const processFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const tempIds = imageFiles.map(f => f.name + f.lastModified);
    setLoadingFiles(prev => [...prev, ...tempIds]);

    const rawAssets = await Promise.all(imageFiles.map(getImageDetails));

    let maxId = 0;
    images.forEach(img => {
      const n = parseInt(img.id, 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });

    // 🎯 使用统一的命名规则：img_001.jpg, img_002.png, ...
    const newAssets = rawAssets.map((asset, index) => {
      const newIndex = maxId + 1 + index;
      const newName = generateImageFilename(newIndex, asset.name);

      return {
        ...asset,
        id: newIndex.toString().padStart(3, '0'),
        name: sanitizeFilename(newName)  // 🔧 使用统一命名 + 清理文件名
      };
    });

    const updatedImages = [...images, ...newAssets];
    onUpdateImages(updatedImages);
    setActiveImageId(newAssets[0]?.id || activeImageId);
    setLoadingFiles(prev => prev.filter(id => !tempIds.includes(id)));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleUploadClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    const usage = imageUsages.find(item => item.image.id === id);
    if (usage && usage.usageCount > 0) {
      const chapterPreview = usage.chapters.slice(0, 5).map(chapter => `- ${chapter.chapterTitle}`).join('\n');
      const confirmed = await dialog.confirm(`这张图片仍被 ${usage.usageCount} 个章节引用：\n${chapterPreview}\n\n确定仍要删除吗？`);
      if (!confirmed) return;
    }

    onUpdateImages(images.filter(img => img.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeImageId === id) {
      const nextImage = images.find(img => img.id !== id);
      setActiveImageId(nextImage?.id || null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await dialog.confirm(`确定删除选中的 ${selectedIds.size} 张图片吗？`))) return;

    onUpdateImages(images.filter(img => !selectedIds.has(img.id)));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  // 🎯 批量重命名功能
  const handleBulkRename = async () => {
    const confirmed = await dialog.confirm(
      `将所有图片重命名为：img_001, img_002, img_003 ...\n\n这将影响 ${images.length} 张图片和所有章节引用，确定继续吗？`
    );
    if (!confirmed) return;

    try {
      // 1. 重命名所有图片（只改文件名，ID 保持不变）
      const { images: renamedImages, oldNameMap } = renameImages(images);

      // 2. 更新所有章节内容中的图片引用
      const updatedChapters = updateChapterImageReferences(chapters, oldNameMap);

      // 3. 一次性更新图片和章节数据
      onUpdateImages(renamedImages);
      if (onUpdateChapters) {
        onUpdateChapters(updatedChapters);
      }

      await dialog.alert(
        `✅ 成功重命名 ${images.length} 张图片！\n\n` +
        `已同步更新所有章节中的图片引用。`
      );
    } catch (error) {
      console.error('批量重命名失败:', error);
      await dialog.alert(`❌ 重命名失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map(img => img.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) setSelectedIds(new Set());
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
      {/* Compact sticky toolbar */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">图片素材</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">{images.length} 张</span>

        <div className="ml-auto flex items-center gap-1.5">
          {images.length > 0 && (
            <button
              onClick={toggleSelectionMode}
              className={`h-7 px-2.5 text-xs rounded-md border transition-colors ${isSelectionMode
                ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-gray-700 dark:text-gray-200'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                }`}
            >
              {isSelectionMode ? '退出多选' : '批量管理'}
            </button>
          )}

          {isSelectionMode ? (
            <>
              <button
                onClick={toggleSelectAll}
                className="h-7 px-2.5 text-xs rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                {selectedIds.size === images.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className={`h-7 px-2.5 text-xs rounded-md flex items-center transition-colors ${selectedIds.size > 0
                  ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                  : 'border border-gray-200 bg-white text-gray-400 cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600'
                  }`}
              >
                <Trash2 size={12} className="mr-1" />
                删除 ({selectedIds.size})
              </button>
            </>
          ) : (
            images.length > 0 && (
              <button
                onClick={handleBulkRename}
                className="h-7 px-2.5 text-xs rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                title="将所有图片重命名为 img_001, img_002, ..."
              >
                <RefreshCw size={12} />
                批量重命名
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Compact dropzone strip */}
        {!isSelectionMode && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`m-3 mb-0 h-16 rounded-md border border-dashed flex items-center justify-center gap-2 cursor-pointer transition-colors ${dragActive ? 'border-orange-500 bg-orange-50 dark:border-gray-600 dark:bg-gray-700' : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'}`}
            title="拖拽或点击上传图片"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUploadClick}
            />
            <UploadCloud size={16} className={dragActive ? 'text-orange-500 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'} />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dragActive ? '释放以上传图片' : <>拖拽图片到此处，或 <span className="text-orange-600 dark:text-gray-300">点击浏览文件</span></>}
            </p>
          </div>
        )}

        {/* Compact active-image usage info block */}
        {activeUsage && !isSelectionMode && (
          <div className="mx-3 mt-3 rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex gap-2.5">
              <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-gray-50 border border-gray-200 dark:bg-gray-800 dark:border-gray-800">
                <img src={activeUsage.image.data} alt={activeUsage.image.name} className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-medium text-gray-900 truncate dark:text-gray-100" title={activeUsage.image.name}>{activeUsage.image.name}</h3>
                  <span className="shrink-0 rounded-full bg-orange-50 text-orange-600 text-[10px] px-1.5 py-0.5 dark:bg-gray-700 dark:text-gray-300">
                    {activeUsage.usageCount} 章引用
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {activeUsage.image.dimensions} · {formatBytes(activeUsage.image.size)}
                </div>
                <div className="mt-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 dark:text-gray-500">引用章节</div>
                  {activeUsage.chapters.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {activeUsage.chapters.map(chapter => (
                        <button
                          key={`${activeUsage.image.id}-${chapter.chapterId}`}
                          onClick={() => onLocateUsage(chapter.chapterId, activeUsage.image.id)}
                          className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-orange-600 transition-colors flex items-center dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <LocateFixed size={10} className="mr-1 shrink-0" />
                          <span className="truncate max-w-[160px]">{chapter.chapterTitle}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">这张图片目前没有被章节引用，可以安全删除。</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {images.length === 0 && loadingFiles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400 dark:text-gray-500">暂无图片素材</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 p-3">
            {imageUsages.map((usage) => (
              <ImageCard
                key={usage.image.id}
                image={usage.image}
                onDelete={handleDelete}
                isSelected={selectedIds.has(usage.image.id)}
                onToggleSelect={toggleSelect}
                selectionMode={isSelectionMode}
                usageCount={usage.usageCount}
                isActive={activeUsage?.image.id === usage.image.id}
                onActivate={setActiveImageId}
              />
            ))}
            {loadingFiles.map((id) => (
              <SkeletonCard key={id} />
            ))}
          </div>
        )}
      </div>
    </div >
  );
};

export default ImagesView;
