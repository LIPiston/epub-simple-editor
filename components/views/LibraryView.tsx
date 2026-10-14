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
    <div className="flex h-full flex-col bg-[#F5F5F7] overflow-hidden">
      {/* 顶部：标题 + 操作 */}
      <div className="flex-none bg-white/80 backdrop-blur-md border-b border-gray-200/60 px-4 md:px-8 py-4 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <LibraryIcon size={20} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-gray-900">书籍管理</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                共 {books.length} 本 · 点击「打开」进入章节管理
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-600 px-3.5 py-2.5 text-sm font-medium transition-colors shadow-sm"
              title="导入 EPUB / TXT / HTML 为一个新书"
            >
              <FileUp size={16} />
              <span className="hidden sm:inline">导入新书</span>
            </button>
            <button
              onClick={() => onCreateBook()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2.5 text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20"
              title="新建一本空白书"
            >
              <BookPlus size={16} />
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

        {/* 搜索 */}
        {books.length > 0 && (
          <div className="mt-4 relative max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索书名或作者…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
          </div>
        )}
      </div>

      {/* 书目列表 */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5">
        {books.length === 0 ? (
          <EmptyState onImport={() => fileInputRef.current?.click()} onCreate={() => onCreateBook()} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search size={36} className="mb-3 opacity-40" />
            <p className="text-sm">没有匹配「{searchTerm}」的书籍</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((book) => {
              const isActive = book.id === activeBookId;
              const isPending = pendingId === book.id;
              const isRenaming = renamingId === book.id;

              return (
                <div
                  key={book.id}
                  className={`group relative flex flex-col rounded-2xl border bg-white p-4 transition-all ${
                    isActive
                      ? 'border-blue-300 ring-2 ring-blue-500/15 shadow-lg shadow-blue-500/5'
                      : 'border-gray-200 hover:border-blue-200 hover:shadow-lg hover:shadow-gray-200/60'
                  }`}
                >
                  {/* 当前书本标记 */}
                  {isActive && (
                    <span className="absolute -top-2 left-4 px-2 py-0.5 text-[10px] font-bold text-white bg-blue-600 rounded-full shadow-sm">
                      当前编辑
                    </span>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="w-11 h-14 flex-none rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center text-slate-400 shadow-inner">
                      <Book size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
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
                          className="w-full text-sm font-bold text-gray-900 bg-white border border-blue-400 rounded-lg px-2 py-1 outline-none ring-2 ring-blue-500/20"
                        />
                      ) : (
                        <h3
                          className="text-sm font-bold text-gray-900 truncate"
                          title={book.title}
                          onDoubleClick={() => startRename(book)}
                        >
                          {book.title}
                        </h3>
                      )}
                      <p className="text-xs text-gray-400 truncate mt-0.5">{book.author}</p>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                        <span>{book.chapterCount} 章</span>
                        <span>{book.imageCount} 图</span>
                        <span>{formatSize(book.sizeBytes)}</span>
                      </div>
                      <p className="text-[10px] text-gray-300 mt-1">更新于 {formatTime(book.updatedAt)}</p>
                    </div>
                  </div>

                  {/* 操作区 */}
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleOpen(book.id)}
                      disabled={isPending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60"
                      title="打开并进入章节管理"
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      {isPending ? '打开中…' : '打开'}
                    </button>

                    <IconAction
                      icon={<Copy size={14} />}
                      title="复制这本书"
                      onClick={() => onDuplicateBook(book.id)}
                    />
                    <IconAction
                      icon={<Pencil size={14} />}
                      title="重命名"
                      onClick={() => startRename(book)}
                    />
                    <IconAction
                      icon={<Trash2 size={14} />}
                      title="删除"
                      danger
                      onClick={() => handleDelete(book)}
                    />
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

/** 卡片右侧的小圆形操作按钮 */
const IconAction: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, title, onClick, danger }) => (
  <button
    onClick={onClick}
    title={title}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
      danger
        ? 'border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
        : 'border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50'
    }`}
  >
    {icon}
  </button>
);

/** 空书库的引导 */
const EmptyState: React.FC<{ onImport: () => void; onCreate: () => void }> = ({ onImport, onCreate }) => (
  <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mb-5">
      <LibraryIcon size={36} />
    </div>
    <h2 className="text-lg font-bold text-gray-800">书库还是空的</h2>
    <p className="text-sm text-gray-400 mt-2 max-w-sm leading-relaxed">
      导入一个 EPUB / TXT / HTML 文件，或直接新建一本空白书开始创作。
      之后每本书都独立保存，切换书时无需再重复导入导出。
    </p>
    <div className="flex items-center gap-3 mt-6">
      <button
        onClick={onImport}
        className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-600 px-4 py-2.5 text-sm font-medium transition-colors shadow-sm"
      >
        <FileUp size={16} />
        导入文件
      </button>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20"
      >
        <BookPlus size={16} />
        新建空白书
      </button>
    </div>
  </div>
);

export default LibraryView;
