import { useState, useEffect, useRef } from 'react';
import { ProjectData } from '../types';
import { readBook, readBookBackup, writeBook, writeBookBackup } from '../utils/bookLibrary';

const DEBOUNCE_TIME = 2000; // 增加到 2 秒，减少频繁保存

/**
 * 自动保存当前书籍
 *
 * 改造为「按书保存」：写入当前书槽（epub_maker_book_<bookId>），
 * 而不是旧的单一 key。这样书库里每本书各存各的，切换书籍不会互相覆盖。
 *
 * @param project 当前书稿内存数据
 * @param bookId  当前书籍 id
 * @param isLoaded 是否已装载完成（未装载完成不写，避免用初始空数据覆盖存档）
 * @param initialEnabled 自动保存开关初值
 */
export const useAutoSave = (
    project: ProjectData,
    bookId: string | null,
    isLoaded: boolean,
    initialEnabled: boolean = true,
) => {
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(initialEnabled);

    // 记录「已保存的是哪本书 + 内容摘要」。
    // signature 为 null 表示这本书还没被观察过 —— 用于区分
    // 「刚装载、一个字都没改」与「真的改了」，前者不应触发保存：
    // 否则每次打开书籍都会原样回写一遍，并把 updatedAt 刷成当前时间，
    // 书库里就再也看不出哪本是真的被编辑过。
    const lastSavedRef = useRef<{ bookId: string | null; signature: string | null }>({
        bookId: null,
        signature: null,
    });
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSavingRef = useRef(false);

    useEffect(() => {
        if (!isLoaded || !autoSaveEnabled || !bookId) return;

        const currentProjectStr = JSON.stringify(project);

        // 换书了（或首次观察）：把当前内容作为基线，不写入。
        // 这一步必须在判断之前，否则会拿上一本书的摘要跟这一本比。
        if (lastSavedRef.current.bookId !== bookId) {
            lastSavedRef.current = { bookId, signature: currentProjectStr };
            setSaveStatus('saved');
            return;
        }

        if (currentProjectStr === lastSavedRef.current.signature) {
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        setSaveStatus('saving');

        saveTimeoutRef.current = setTimeout(async () => {
            if (isSavingRef.current) return;
            isSavingRef.current = true;

            try {
                // 先备份当前书（如果存在）
                const existing = await readBook(bookId);
                if (existing) {
                    await writeBookBackup(bookId, existing);
                }

                await writeBook(bookId, project);
                lastSavedRef.current = { bookId, signature: currentProjectStr };
                setSaveStatus('saved');

                console.log('✅ 自动保存成功', new Date().toLocaleTimeString());
            } catch (e: any) {
                console.error('❌ 保存失败:', e);
                setSaveStatus('error');

                if (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                    const shouldExport = window.confirm(
                        '⚠️ 存储空间不足！\n\n' +
                        '项目内容已超过浏览器存储限制。\n\n' +
                        '建议立即导出 EPUB 文件保存您的工作。\n\n' +
                        '点击「确定」关闭自动保存，点击「取消」继续尝试。',
                    );
                    if (shouldExport) {
                        setAutoSaveEnabled(false);
                        alert('💡 提示：请点击左侧菜单的「导出 EPUB」按钮保存您的作品。');
                    }
                } else {
                    console.warn('尝试恢复备份数据...');
                    try {
                        const backup = await readBookBackup(bookId);
                        if (backup) {
                            await writeBook(bookId, backup);
                            console.log('✅ 已恢复备份数据');
                        }
                    } catch (restoreErr) {
                        console.error('恢复备份失败:', restoreErr);
                    }
                }
            } finally {
                isSavingRef.current = false;
            }
        }, DEBOUNCE_TIME);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [project, bookId, isLoaded, autoSaveEnabled]);

    const toggleAutoSave = () => {
        setAutoSaveEnabled(prev => !prev);
    };

    return { saveStatus, autoSaveEnabled, toggleAutoSave };
};
