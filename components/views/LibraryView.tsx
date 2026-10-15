/**
 * LibraryView - 书籍管理界面
 *
 * 解决的问题：此前整个应用只有「一个项目」，想换一本书只能先把当前书导出、
 * 清空、再导入新的。长篇系列或多本书并行修改时，这个来回非常难受。
 *
 * 这里提供一个独立的书库界面：所有书列在一起，可直接打开、导入、新建、
 * 复制、重命名、删除；点「打开」即跳到这本书的章节管理。
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Book,
  BookPlus,
  Copy,
  FileUp,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Library as LibraryIcon,
  ArrowRight,
} from 'lucide-react';
import { LibraryBook } from '../../utils/bookLibrary';
import { dialog } from '../../services/dialog';

interface LibraryViewProps {
  books: LibraryBook[];
  activeBookId: string | null;
  /** 打开某本书（并跳到章节管理） */
  onOpenBook: (bookId: string) => void | Promise<void>;
  /** 新建空白书 */
  onCreateBook: () => void | Promise<void>;
  /** 导入文件成新书 */
  onImportFiles: (files: File[]) => void | Promise<void>;
  /** 复制一本书 */
  onDuplicateBook: (bookId: string) => void | Promise<void>;
  /** 重命名一本书 */
  onRenameBook: (bookId: string, title: string) => void | Promise<void>;
  /** 删除一本书 */
  onDeleteBook: (bookId: string) => void | Promise<void>;
}

/** 人类可读的体积 */
const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

/** 相对时间：今天 / 昨天 / N 天前 / 具体日期 */
const formatTime = (timestamp: number): string => {
  if (!timestamp) return '—';
  const then = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86400000);

  if (diffDays <= 0) return `今天 ${then.toTimeString().slice(0, 5)}`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 30) return `${diffDays} 天前`;
  return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(then.getDate()).padStart(2, '0')}`;
};

const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  activeBookId,
  onOpenBook,
  onCreateBook,
  onImportFiles,
  onDuplicateBook,
  onRenameBook,
  onDeleteBook,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        b.author.toLowerCase().includes(term),
    );
  }, [books, searchTerm]);

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ''; // 允许重复选择同一个文件
    if (files.length === 0) return;
    await onImportFiles(files);
  };

  const handleOpen = async (bookId: string) => {
    setPendingId(bookId);
    try {
      await onOpenBook(bookId);
    } finally {
      setPendingId(null);
    }
  };

  const startRename = (book: LibraryBook) => {
    setRenamingId(book.id);
    setRenameValue(book.title);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    const value = renameValue.trim();
    setRenamingId(null);
    if (!value) return;
    await onRenameBook(id, value);
  };

  const handleDelete = async (book: LibraryBook) => {
    const confirmed = await dialog.confirm(
      `确定要删除《${book.title}》吗？\n\n该书的全部章节、图片与样式都会被删除，且无法撤销。\n建议先导出 EPUB 备份。`,
      '删除书籍',
    );
    if (confirmed) await onDeleteBook(book.id);
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 overflow-hidden dark:bg-gray-900">
      {/* 紧凑工具栏：标题 + 计数 + 搜索 + 操作 */}
      <div className="flex-none border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">书籍管理</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">共 {books.length} 本</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {books.length > 0 && (
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索书名或作者…"
                  className="h-7 w-44 rounded-md border border-gray-200 bg-white pl-7 pr-2 text-xs text-gray-700 outline-none transition-colors focus:border-orange-400 focus:ring-1 focus:ring-orange-400/40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
                />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-orange-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              title="导入 EPUB / TXT / HTML 为一个新书"
            >
              <FileUp size={14} />
              <span className="hidden sm:inline">导入新书</span>
            </button>
            <button
              onClick={() => onCreateBook()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-orange-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500"
              title="新建一本空白书"
            >
              <BookPlus size={14} />
              <span className="hidden sm:inline">新建空白书</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.txt,.html,.htm"
              multiple
              className="hidden"
              onChange={handleImportChange}
            />
          </div>
        </div>
      </div>

      {/* 书目：密集列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        {books.length === 0 ? (
          <EmptyState onImport={() => fileInputRef.current?.click()} onCreate={() => onCreateBook()} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
            <Search size={20} className="mb-2 opacity-40" />
            <p className="text-xs">没有匹配「{searchTerm}」的书籍</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {filtered.map((book) => {
              const isActive = book.id === activeBookId;
              const isPending = pendingId === book.id;
              const isRenaming = renamingId === book.id;

              return (
                <div
                  key={book.id}
                  data-book-card={book.id}
                  className={`group flex items-start gap-2.5 border-l-2 px-3 py-2 transition-colors ${
                    isActive
                      ? 'border-orange-600 bg-orange-50 dark:border-gray-600 dark:bg-gray-700'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Book size={14} className="mt-1 flex-none text-gray-400 dark:text-gray-500" />

                  <div className="min-w-0 flex-1">
                    {/* 第一行：书名 + 状态 + 操作 */}
                    <div className="flex items-center gap-2">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="min-w-0 flex-1 rounded-sm border border-orange-400 bg-white px-1.5 py-0.5 text-[13px] font-semibold text-gray-900 outline-none ring-1 ring-orange-400/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      ) : (
                        <h3
                          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100"
                          title={book.title}
                          onDoubleClick={() => startRename(book)}
                        >
                          {book.title}
                        </h3>
                      )}

                      {isActive && (
                        <span className="flex-none rounded-sm bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-gray-700 dark:text-gray-200">
                          当前编辑
                        </span>
                      )}

                      <div className="ml-auto flex flex-none items-center gap-1">
                        <button
                          onClick={() => handleOpen(book.id)}
                          disabled={isPending}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-orange-600 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                          title="打开并进入章节管理"
                        >
                          {isPending ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                          {isPending ? '打开中…' : '打开'}
                        </button>

                        <IconAction
                          icon={<Copy size={12} />}
                          title="复制这本书"
                          onClick={() => onDuplicateBook(book.id)}
                        />
                        <IconAction
                          icon={<Pencil size={12} />}
                          title="重命名"
                          onClick={() => startRename(book)}
                        />
                        <IconAction
                          icon={<Trash2 size={12} />}
                          title="删除"
                          danger
                          onClick={() => handleDelete(book)}
                        />
                      </div>
                    </div>

                    {/* 第二行：作者 + 元信息 */}
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {book.author && (
                        <>
                          <span className="truncate">{book.author}</span>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                        </>
                      )}
                      <span className="flex-none">{book.chapterCount} 章</span>
                      <span className="flex-none">{book.imageCount} 图</span>
                      <span className="flex-none">{formatSize(book.sizeBytes)}</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="truncate">更新于 {formatTime(book.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/** 列表行右侧的小方形操作按钮 */
const IconAction: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, title, onClick, danger }) => (
  <button
    onClick={onClick}
    title={title}
    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white transition-colors dark:border-gray-700 dark:bg-gray-700 ${
      danger
        ? 'text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-400'
        : 'text-gray-400 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 dark:text-gray-500 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300'
    }`}
  >
    {icon}
  </button>
);

/** 空书库的引导 */
const EmptyState: React.FC<{ onImport: () => void; onCreate: () => void }> = ({ onImport, onCreate }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <LibraryIcon size={22} className="mb-2 text-gray-300 dark:text-gray-600" />
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">书库还是空的</p>
    <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-400 dark:text-gray-500">
      导入一个 EPUB / TXT / HTML 文件，或直接新建一本空白书开始创作。
      之后每本书都独立保存，切换书时无需再重复导入导出。
    </p>
    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={onImport}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-orange-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <FileUp size={14} />
        导入文件
      </button>
      <button
        onClick={onCreate}
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-orange-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500"
      >
        <BookPlus size={14} />
        新建空白书
      </button>
    </div>
  </div>
);

export default LibraryView;
