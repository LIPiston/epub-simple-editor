import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ViewMode } from './types';
import Navigation from './components/layout/Navigation';
import { generateEpub } from './services/epub/generator';
import { Menu, PowerOff, Cloud, CheckCircle2, AlertTriangle } from 'lucide-react';

import LoadingOverlay from './components/layout/LoadingOverlay';
import ViewContainer from './components/layout/ViewContainer';
import { useProject } from './hooks/useProject';
import { useAutoSave } from './hooks/useAutoSave';
import { useBookLibrary } from './hooks/useBookLibrary';
import { useTheme } from './hooks/useTheme';
import GlobalDialogs from './components/ui/GlobalDialogs';
import TooltipLayer from './components/ui/TooltipLayer';
import { DEFAULT_VIEW, getGroup, findGroupIdForView } from './components/layout/navConfig';

interface EditorFocusRequest {
  anchorId?: string | null;
  searchText?: string | null;
  imageId?: string | null;
  key: number;
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>(DEFAULT_VIEW);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState<EditorFocusRequest | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState('');

  // ─── 书库（多本书的索引与切换）───
  const library = useBookLibrary();
  const {
    books: libraryBooks,
    activeBookId,
    initialize,
    openBook,
    createBook,
    importFiles,
    duplicateBook,
    renameBook,
    removeBook,
    syncActiveBookMeta,
    resetLibrary,
  } = library;

  // ─── 当前书的内存数据 ───
  const {
    project,
    activeChapterId,
    activeChapter,
    isLoaded,
    loadProject,
    setActiveChapterId,
    updateProject,
    updateChapters,
    updateChapterContent,
    splitChapter,
    loadChaptersFromImport,
  } = useProject(activeBookId);

  const { saveStatus, autoSaveEnabled, toggleAutoSave } = useAutoSave(project, activeBookId, isLoaded);

  // 深/浅色主题：首次跟随系统，用户切换后记住选择
  const { isDark, toggleTheme } = useTheme();

  // ─── 首次加载：迁移旧数据 → 读书库 → 装载当前书 ───
  // initialize 内部去重，StrictMode 下重复调用不会建出两本空白书。
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { project: initialProject } = await initialize();
      if (cancelled) return;
      loadProject(initialProject);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialize, loadProject]);

  // ─── 书稿变化时同步书目信息（章节数、体积、更新时间）───
  // 防抖：编辑时 project 每 2 秒左右才落盘，这里跟进更新即可，不必每次按键都写索引。
  //
  // 刚装载的那一次必须跳过：否则每次「打开」书籍都会刷新 updatedAt，
  // 书库里的「更新于」就失去意义（分不清是被编辑过还是仅打开过）。
  const syncedMetaRef = useRef<{ bookId: string | null; signature: string | null }>({
    bookId: null,
    signature: null,
  });

  useEffect(() => {
    if (!isLoaded || !activeBookId) return;

    const signature = JSON.stringify(project);

    // 换书或首次观察：记为基线，不回写
    if (syncedMetaRef.current.bookId !== activeBookId) {
      syncedMetaRef.current = { bookId: activeBookId, signature };
      return;
    }
    if (signature === syncedMetaRef.current.signature) return;

    const timer = setTimeout(() => {
      syncedMetaRef.current = { bookId: activeBookId, signature };
      void syncActiveBookMeta(project);
    }, 1500);
    return () => clearTimeout(timer);
  }, [project, isLoaded, activeBookId, syncActiveBookMeta]);

  /** 打开某本书并跳到章节管理 */
  const handleOpenBook = useCallback(async (bookId: string) => {
    if (bookId === activeBookId) {
      // 已是当前书：直接跳过去，不必重新读盘
      setCurrentView('chapters');
      return;
    }
    const data = await openBook(bookId);
    if (data) {
      loadProject(data);
      setEditorFocusRequest(null);
      setCurrentView('chapters');
    }
  }, [activeBookId, openBook, loadProject]);

  /** 新建空白书并进去编辑 */
  const handleCreateBook = useCallback(async () => {
    const id = await createBook();
    if (id) {
      const data = await openBook(id);
      if (data) {
        loadProject(data);
        setEditorFocusRequest(null);
        setCurrentView('chapters');
      }
    }
  }, [createBook, openBook, loadProject]);

  /** 从书库导入文件为新书 */
  const handleLibraryImport = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    setProcessMessage(`正在导入 ${files.length} 个文件...`);
    try {
      const createdIds = await importFiles(files);
      if (createdIds.length > 0) {
        // importFiles 已把最后一本设为当前书，装载它并进入编辑
        const data = await openBook(createdIds[createdIds.length - 1]);
        if (data) {
          loadProject(data);
          setEditorFocusRequest(null);
          setCurrentView('chapters');
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }, [importFiles, openBook, loadProject]);

  /** 复制某本书并切过去 */
  const handleDuplicateBook = useCallback(async (bookId: string) => {
    const id = await duplicateBook(bookId);
    if (id) {
      const data = await openBook(id);
      if (data) {
        loadProject(data);
        setEditorFocusRequest(null);
        setCurrentView('chapters');
      }
    }
  }, [duplicateBook, openBook, loadProject]);

  /** 重命名：列表与书稿元数据都要改；若改的是当前书，同步内存里的书名 */
  const handleRenameBook = useCallback(async (bookId: string, title: string) => {
    await renameBook(bookId, title);
    if (bookId === activeBookId) {
      updateProject({ metadata: { ...project.metadata, title } });
    }
  }, [renameBook, activeBookId, project.metadata, updateProject]);

  /** 删除书；删掉的若是当前书，就切到剩下的一本或新建 */
  const handleDeleteBook = useCallback(async (bookId: string) => {
    const wasActive = bookId === activeBookId;
    await removeBook(bookId);

    if (wasActive) {
      const remaining = libraryBooks.filter((b) => b.id !== bookId);
      if (remaining.length > 0) {
        const data = await openBook(remaining[0].id);
        if (data) loadProject(data);
      } else {
        // 删光了：新建一本空白书，避免界面停在无处可去的状态
        const id = await createBook();
        if (id) {
          const data = await openBook(id);
          if (data) loadProject(data);
        }
      }
      setEditorFocusRequest(null);
      setCurrentView('library');
    }
  }, [activeBookId, removeBook, libraryBooks, openBook, createBook, loadProject]);

  const handleReset = async () => {
    await resetLibrary();
    window.location.reload();
  };

  const handleSelectChapter = (id: string) => {
    if (id === activeChapterId) return;
    setActiveChapterId(id);
    setEditorFocusRequest(null);
  };

  const handleScrollToAnchor = (chapterId: string, anchorId: string) => {
    setCurrentView('chapters');
    if (activeChapterId !== chapterId) {
      setActiveChapterId(chapterId);
    }
    setTimeout(() => {
      setEditorFocusRequest({
        anchorId,
        searchText: null,
        imageId: null,
        key: Date.now(),
      });
    }, 50);
  };

  const handleFocusSearchText = (chapterId: string, searchText: string) => {
    setCurrentView('chapters');
    if (activeChapterId !== chapterId) {
      setActiveChapterId(chapterId);
    }
    setTimeout(() => {
      setEditorFocusRequest({
        anchorId: null,
        searchText,
        imageId: null,
        key: Date.now(),
      });
    }, 50);
  };

  const handleFocusImageReference = (chapterId: string, imageId: string) => {
    setCurrentView('chapters');
    if (activeChapterId !== chapterId) {
      setActiveChapterId(chapterId);
    }
    setTimeout(() => {
      setEditorFocusRequest({
        anchorId: null,
        searchText: null,
        imageId,
        key: Date.now(),
      });
    }, 50);
  };

  const handleChaptersLoaded = (chapters: any[], firstChapterId: string) => {
    loadChaptersFromImport(chapters, firstChapterId);
    setCurrentView('chapters');
  };

  const handleLoadingStart = (msg: string) => {
    setProcessMessage(msg);
    setIsProcessing(true);
  };

  const handleLoadingEnd = () => {
    setIsProcessing(false);
  };

  // 书库尚未就绪、或当前书还在装载时显示加载态
  if (!isLoaded || !activeBookId) {
    return <LoadingOverlay message="正在恢复上次的项目..." />;
  }

  return (
    <div className="flex h-screen bg-white font-sans text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        onExport={() => generateEpub(project)}
        onReset={handleReset}
        currentBookTitle={project.metadata?.title}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="md:hidden flex items-center justify-between h-12 bg-white border-b border-gray-200 px-3 flex-none z-30 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              title="打开导航"
              className="p-2 -ml-1 text-gray-600 hover:bg-gray-100 rounded-md flex-none dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Menu size={20} />
            </button>
            <span className="font-semibold text-gray-800 ml-1 truncate dark:text-gray-200">
              {getGroup(findGroupIdForView(currentView)).label}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <ViewContainer
            currentView={currentView}
            project={project}
            bookId={activeBookId}
            activeChapterId={activeChapterId}
            activeChapter={activeChapter}
            editorFocusRequest={editorFocusRequest}
            onUpdateProject={updateProject}
            onUpdateChapters={updateChapters}
            onSelectChapter={handleSelectChapter}
            onScrollToAnchor={handleScrollToAnchor}
            onFocusSearchText={handleFocusSearchText}
            onFocusImageReference={handleFocusImageReference}
            onUpdateChapterContent={updateChapterContent}
            onSplitChapter={splitChapter}
            onChaptersLoaded={handleChaptersLoaded}
            onLoadingStart={handleLoadingStart}
            onLoadingEnd={handleLoadingEnd}
            onMobileBack={() => setActiveChapterId(null)}
            libraryBooks={libraryBooks}
            activeBookId={activeBookId}
            onOpenBook={handleOpenBook}
            onCreateBook={handleCreateBook}
            onImportFiles={handleLibraryImport}
            onDuplicateBook={handleDuplicateBook}
            onRenameBook={handleRenameBook}
            onDeleteBook={handleDeleteBook}
          />
        </div>

        <button
          onClick={toggleAutoSave}
          className={`absolute right-4 z-50 transition-transform active:scale-95 focus:outline-none ${
            // 编辑器视图底部有 40px 高的状态栏（EditorStatusBar），胶囊需上移让开它，
            // 否则会盖住状态栏上的「记忆位置」开关和字体控件。
            currentView === 'chapters' && activeChapter ? 'bottom-14' : 'bottom-4'
          }`}
          title={autoSaveEnabled ? '点击关闭自动保存' : '点击开启自动保存'}
        >
          {!autoSaveEnabled ? (
            <div className="flex items-center text-xs text-gray-500 bg-white py-1.5 px-3 rounded-md border border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
              <PowerOff size={14} className="mr-2" />
              自动保存已关
            </div>
          ) : saveStatus === 'saving' ? (
            <div className="flex items-center text-xs text-orange-700 bg-orange-50 py-1.5 px-3 rounded-md border border-orange-200 hover:bg-orange-100 dark:text-orange-300 dark:bg-orange-950 dark:border-orange-800 dark:hover:bg-orange-900">
              <Cloud size={14} className="mr-2 animate-pulse" />
              保存中...
            </div>
          ) : saveStatus === 'error' ? (
            <div className="flex items-center text-xs text-red-700 bg-red-50 py-1.5 px-3 rounded-md border border-red-200 hover:bg-red-100 dark:text-red-300 dark:bg-red-950 dark:border-red-800 dark:hover:bg-red-900">
              <AlertTriangle size={14} className="mr-2" />
              保存失败(容量不足)
            </div>
          ) : (
            <div className="flex items-center text-xs text-orange-700 bg-white py-1.5 px-3 rounded-md border border-gray-200 hover:bg-gray-50 dark:text-orange-400 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
              <CheckCircle2 size={14} className="mr-2" />
              已保存
            </div>
          )}
        </button>

        {isProcessing && <LoadingOverlay message={processMessage} />}

        <GlobalDialogs />
      </main>

      {/* 全局悬浮提示：替代系统绘制的 title 黑框，跟随主题 */}
      <TooltipLayer />
    </div>
  );
};

export default App;
