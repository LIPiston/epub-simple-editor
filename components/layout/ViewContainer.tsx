import React from 'react';
import { ViewMode, ProjectData, Chapter, TocItem } from '../../types';
import TextEditor from '../text-editor/TextEditor';
import ChapterManager from '../chapter-manager/ChapterManager';
import CoverGenerator from '../views/CoverView';
import FilesView from '../views/FilesView';
import MetadataView from '../views/MetadataView';
import StylesView from '../views/StylesView';
import ImagesView from '../views/ImagesView';
import StructureView from '../views/StructureView';
import LibraryView from '../views/LibraryView';
import SyncView from '../views/SyncView';
import { LibraryBook } from '../../utils/bookLibrary';
import { BookOpen, GripVertical } from 'lucide-react';
import { useResizableSidebar } from '../../hooks/useResizableSidebar';

interface ViewContainerProps {
  currentView: ViewMode;
  project: ProjectData;
  /** 当前书籍 id（阅读位置按书籍隔离） */
  bookId: string | null;
  activeChapterId: string | null;
  activeChapter: Chapter | undefined;
  editorFocusRequest: {
    anchorId?: string | null;
    searchText?: string | null;
    imageId?: string | null;
    key: number;
  } | null;
  // Actions
  onUpdateProject: (updates: Partial<ProjectData>) => void;
  onUpdateChapters: (chapters: Chapter[]) => void;
  onSelectChapter: (id: string) => void;
  onScrollToAnchor: (chapterId: string, anchorId: string) => void;
  onFocusSearchText: (chapterId: string, searchText: string) => void;
  onFocusImageReference: (chapterId: string, imageId: string) => void;
  onUpdateChapterContent: (newContent: string, newTitle?: string, subItems?: TocItem[]) => void;
  onSplitChapter: (before: string, after: string) => void;
  onChaptersLoaded: (chapters: Chapter[], firstId: string) => void;
  onLoadingStart: (msg: string) => void;
  onLoadingEnd: () => void;
  onMobileBack: () => void;
  // 书库（书籍管理视图）
  libraryBooks: LibraryBook[];
  activeBookId: string | null;
  onOpenBook: (bookId: string) => void | Promise<void>;
  onCreateBook: () => void | Promise<void>;
  onImportFiles: (files: File[]) => void | Promise<void>;
  onDuplicateBook: (bookId: string) => void | Promise<void>;
  onRenameBook: (bookId: string, title: string) => void | Promise<void>;
  onDeleteBook: (bookId: string) => void | Promise<void>;
}

/**
 * ChaptersView - 章节编辑视图（带可调整宽度的侧边栏）
 */
const ChaptersView: React.FC<{
  project: ProjectData;
  bookId: string | null;
  activeChapterId: string | null;
  activeChapter: Chapter | undefined;
  editorFocusRequest: ViewContainerProps['editorFocusRequest'];
  onUpdateProject: ViewContainerProps['onUpdateProject'];
  onUpdateChapters: ViewContainerProps['onUpdateChapters'];
  onSelectChapter: ViewContainerProps['onSelectChapter'];
  onScrollToAnchor: ViewContainerProps['onScrollToAnchor'];
  onFocusSearchText: ViewContainerProps['onFocusSearchText'];
  onUpdateChapterContent: ViewContainerProps['onUpdateChapterContent'];
  onSplitChapter: ViewContainerProps['onSplitChapter'];
  onMobileBack: ViewContainerProps['onMobileBack'];
}> = ({
  project,
  bookId,
  activeChapterId,
  activeChapter,
  editorFocusRequest,
  onUpdateProject,
  onUpdateChapters,
  onSelectChapter,
  onScrollToAnchor,
  onFocusSearchText,
  onUpdateChapterContent,
  onSplitChapter,
  onMobileBack,
}) => {
  const { width, isDragging, isMobile, handleMouseDown } = useResizableSidebar();

  return (
    <div className="flex flex-1 h-full overflow-hidden relative">
      {/* 目录列表区：可调整宽度（桌面端），移动端全屏 */}
      <div
        className={`${activeChapterId ? 'hidden md:flex' : 'flex'} h-full flex-col flex-shrink-0`}
        style={{
          width: isMobile ? '100%' : `${width}px`,
        }}
      >
        <ChapterManager
          chapters={project.chapters}
          images={project.images}
          currentChapterId={activeChapterId}
          onSelectChapter={onSelectChapter}
          onScrollToAnchor={onScrollToAnchor}
          onFocusSearchText={onFocusSearchText}
          onUpdateChapters={(chapters) => onUpdateProject({ chapters, customTocXhtml: undefined })}
          customTocTitle={project.customTocTitle}
          onUpdateTocTitle={(customTocTitle) => onUpdateProject({ customTocTitle, customTocXhtml: undefined })}
          className="w-full"
        />
      </div>

      {/* 拖拽分割条：仅桌面端显示 */}
      {!isMobile && (
        <div
          className={`hidden md:flex items-center justify-center w-1 bg-gray-200/50 hover:bg-orange-400 transition-colors cursor-col-resize group relative dark:bg-gray-700/50 ${
            isDragging ? 'bg-orange-500' : ''
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <GripVertical
            size={16}
            className={`text-gray-400 dark:text-gray-500 group-hover:text-white transition-colors ${
              isDragging ? 'text-white' : ''
            }`}
          />
        </div>
      )}

      {/* 编辑器区域 */}
      <div className={`${!activeChapterId ? 'hidden md:flex' : 'flex'} flex-1 h-full flex-col min-w-0`}>
        {activeChapter && activeChapterId && bookId ? (
          <TextEditor
            key={activeChapterId}
            chapterId={activeChapterId}
            bookId={bookId}
            content={activeChapter.content}
            onContentChange={onUpdateChapterContent}
            onSplitChapter={onSplitChapter}
            project={project}
            onUpdateProject={onUpdateProject}
            focusRequest={editorFocusRequest}
            activeChapter={activeChapter}
            onMobileBack={onMobileBack}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500">
            <BookOpen size={48} className="mb-4" />
            <p>请从左侧选择一个章节开始编辑</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ViewContainer: React.FC<ViewContainerProps> = ({
  currentView,
  project,
  bookId,
  activeChapterId,
  activeChapter,
  editorFocusRequest,
  onUpdateProject,
  onUpdateChapters,
  onSelectChapter,
  onScrollToAnchor,
  onFocusSearchText,
  onFocusImageReference,
  onUpdateChapterContent,
  onSplitChapter,
  onChaptersLoaded,
  onLoadingStart,
  onLoadingEnd,
  onMobileBack,
  libraryBooks,
  activeBookId,
  onOpenBook,
  onCreateBook,
  onImportFiles,
  onDuplicateBook,
  onRenameBook,
  onDeleteBook,
}) => {
  switch (currentView) {
    case 'library':
      return <LibraryView
        books={libraryBooks}
        activeBookId={activeBookId}
        onOpenBook={onOpenBook}
        onCreateBook={onCreateBook}
        onImportFiles={onImportFiles}
        onDuplicateBook={onDuplicateBook}
        onRenameBook={onRenameBook}
        onDeleteBook={onDeleteBook}
      />;
    case 'files':
      return <FilesView
        onProjectUpdate={onUpdateProject}
        onChaptersLoaded={onChaptersLoaded}
        onLoadingStart={onLoadingStart}
        onLoadingEnd={onLoadingEnd}
      />;
    case 'chapters':
      return <ChaptersView
        project={project}
        bookId={bookId}
        activeChapterId={activeChapterId}
        activeChapter={activeChapter}
        editorFocusRequest={editorFocusRequest}
        onUpdateProject={onUpdateProject}
        onUpdateChapters={onUpdateChapters}
        onSelectChapter={onSelectChapter}
        onScrollToAnchor={onScrollToAnchor}
        onFocusSearchText={onFocusSearchText}
        onUpdateChapterContent={onUpdateChapterContent}
        onSplitChapter={onSplitChapter}
        onMobileBack={onMobileBack}
      />;
    case 'metadata':
      return <MetadataView metadata={project.metadata} onUpdate={(m) => onUpdateProject({ metadata: m })} />;
    case 'styles':
      return <StylesView project={project} activeChapter={activeChapter} onUpdateProject={onUpdateProject} />;
    case 'images':
      return (
        <ImagesView
          images={project.images}
          chapters={project.chapters}
          onUpdateImages={(images) => onUpdateProject({ images })}
          onUpdateChapters={onUpdateChapters}
          onLocateUsage={onFocusImageReference}
        />
      );
    case 'cover':
      return <CoverGenerator
        project={project}
        onUpdateCover={(cover, coverId) => onUpdateProject({ cover, coverId: coverId || null })}
        onUpdateCoverCSS={(coverCustomCSS) => onUpdateProject({ coverCustomCSS })}
        onUpdateCoverDesign={(coverDesign) => onUpdateProject({ coverDesign })}
        onAddImage={(img) => onUpdateProject({ images: [...project.images, img] })}
        coverGeneratorState={project.coverGeneratorState}
        onUpdateGeneratorState={(state) => onUpdateProject({ coverGeneratorState: { ...project.coverGeneratorState, ...state } })}
      />;
    case 'structure':
      return <StructureView project={project} onUpdateProject={onUpdateProject} />;
    case 'sync':
      // 云同步是整库级别的操作，与「当前这本书」无关，因此不需要 project 等入参
      return <SyncView />;
    default:
      return <div>Unknown view</div>;
  }
};

export default ViewContainer;
