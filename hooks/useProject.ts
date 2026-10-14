import { useCallback, useRef, useState } from 'react';
import { ProjectData, Chapter, TocItem } from '../types';
import { getInitialState, normalizeProject } from '../utils/projectDefaults';
import { getResumeChapterId, markChapterAsCurrent } from '../utils/readingPosition';

/**
 * useProject - 单本书的内存数据与编辑操作
 *
 * 职责收窄为「当前这本书」：章节、图片、样式等内存状态，
 * 以及章节内容更新、拆分等编辑动作。
 *
 * 不再自己读写存储 —— 书本的持久化由 useBookLibrary（书库）与
 * useAutoSave（自动保存到当前书槽）负责。这样切换书籍只需调用
 * loadProject 灌入新数据，不必关心存储细节。
 *
 * @param bookId 当前书籍 id，用于按书籍隔离阅读位置
 */
export const useProject = (bookId: string | null) => {
    const [project, setProject] = useState<ProjectData>(getInitialState());
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // bookId 会随切换书籍变化，用 ref 让回调读到最新值
    const bookIdRef = useRef<string | null>(bookId);
    bookIdRef.current = bookId;

    /**
     * 装载一本书的数据。
     *
     * 顺便决定初始选中哪一章：开启「记忆阅读位置」且记录的章节仍存在时，
     * 回到那一章；否则打开第一章。
     */
    const loadProject = useCallback((data: ProjectData | null) => {
        const next = normalizeProject(data);
        setProject(next);

        const chapters = next.chapters || [];
        if (chapters.length > 0) {
            const currentBookId = bookIdRef.current;
            const resumeId = currentBookId ? getResumeChapterId(currentBookId) : null;
            const canResume = !!resumeId && chapters.some((c) => c.id === resumeId);
            setActiveChapterId(canResume ? resumeId : chapters[0].id);
        } else {
            setActiveChapterId(null);
        }

        setIsLoaded(true);
    }, []);

    const updateProject = useCallback((updates: Partial<ProjectData>) => {
        setProject(prev => ({ ...prev, ...updates }));
    }, []);

    const updateChapters = useCallback((chapters: Chapter[]) => {
        setProject(prev => ({ ...prev, chapters }));
    }, []);

    const updateChapterContent = useCallback((newContent: string, newTitle?: string, subItems?: TocItem[]) => {
        if (!activeChapterId) return;
        setProject(prev => ({
            ...prev,
            chapters: prev.chapters.map(c => {
                if (c.id === activeChapterId) {
                    const updatedChapter = { ...c, content: newContent };
                    if (newTitle !== undefined) {
                        updatedChapter.title = newTitle;
                    }
                    if (subItems !== undefined) {
                        updatedChapter.subItems = subItems;
                    }
                    return updatedChapter;
                }
                return c;
            })
        }));
    }, [activeChapterId]);

    /**
     * 切换当前章节。
     * 开启记忆功能时顺手记录「最近查看的章节」，这样即使用户只是打开某章
     * 浏览、没有滚动或编辑，刷新后也能回到这一章。
     */
    const setActiveChapter = useCallback((id: string | null) => {
        setActiveChapterId(id);
        const currentBookId = bookIdRef.current;
        if (id && currentBookId) markChapterAsCurrent(currentBookId, id);
    }, []);

    const splitChapter = useCallback((beforeContent: string, afterContent: string) => {
        if (!activeChapterId) return;

        // Helper to parse title and subItems from HTML content
        const parseMeta = (html: string, defaultTitle: string) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const headings = doc.querySelectorAll('h1, h2');
            let title = defaultTitle;
            const subItems: TocItem[] = [];
            let titleFound = false;

            headings.forEach(el => {
                const text = el.textContent?.trim() || '';
                if (el.tagName === 'H1') {
                    if (!titleFound) {
                        title = text;
                        titleFound = true;
                    } else {
                        if (el.id) subItems.push({ id: el.id, text, level: 1 });
                    }
                } else if (el.tagName === 'H2') {
                    if (el.id) subItems.push({ id: el.id, text, level: 2 });
                }
            });
            return { title, subItems };
        };

        setProject(prev => {
            const chapterIndex = prev.chapters.findIndex(c => c.id === activeChapterId);
            if (chapterIndex === -1) return prev;

            const currentChapter = prev.chapters[chapterIndex];

            const beforeMeta = parseMeta(beforeContent, currentChapter.title);
            const updatedCurrentChapter = {
                ...currentChapter,
                content: beforeContent,
                title: beforeMeta.title,
                subItems: beforeMeta.subItems
            };

            const afterMeta = parseMeta(afterContent, '新章节 (切分)');

            // 使用更安全的 ID 生成方式
            const newChapter: Chapter = {
                id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                title: afterMeta.title,
                content: afterContent,
                level: currentChapter.level,
                subItems: afterMeta.subItems,
            };

            const newChapters = [...prev.chapters];
            newChapters[chapterIndex] = updatedCurrentChapter;
            newChapters.splice(chapterIndex + 1, 0, newChapter);

            setActiveChapterId(newChapter.id);
            return { ...prev, chapters: newChapters };
        });
    }, [activeChapterId]);

    const loadChaptersFromImport = useCallback((chapters: Chapter[], firstChapterId: string) => {
        // 不再重复写 chapters —— 调用者已通过 onProjectUpdate 写入了完整数据
        // 如果这里再 updateProject({ chapters })，会覆盖掉刚写入的 images/cover 等字段
        setActiveChapterId(firstChapterId);
    }, []);

    const activeChapter = project.chapters.find(c => c.id === activeChapterId);

    return {
        project,
        activeChapterId,
        activeChapter,
        isLoaded,
        loadProject,
        setActiveChapterId: setActiveChapter,
        updateProject,
        updateChapters,
        updateChapterContent,
        splitChapter,
        loadChaptersFromImport,
    };
};
