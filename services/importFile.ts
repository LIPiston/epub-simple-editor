/**
 * 文件导入服务
 *
 * 把「读一个文件 → 得到完整 ProjectData」的逻辑集中在这里。
 *
 * 之所以抽出来：书籍管理界面要能直接导入 TXT / EPUB / HTML 成一本新书，
 * 而已有的「文件导入」视图也在做同样的事。若各写一份，解析选项
 * （清洗 HTML、移除内页图片、章节切分正则）就会慢慢分叉，
 * 同一个文件在两个入口导入出不同结果。
 *
 * 这里不碰任何 UI 状态（loading、弹窗），只负责解析与数据组装，
 * 调用方各自决定如何提示进度与错误。
 */

import { Chapter, ProjectData } from '../types';
import { parseEpub } from './epub/importer';
import { parseTxtToChapters } from './parser/text';
import { parseHtmlToChapters } from './parser/html';
import { getInitialState, normalizeProject } from '../utils/projectDefaults';
import { generateUniqueId } from '../utils/idGenerator';

export type ImportableKind = 'epub' | 'txt' | 'html';

/** 各类导入可选的解析参数 */
export interface ImportOptions {
    /** EPUB：清洗旧版 HTML 冗余标签 */
    cleanHtml?: boolean;
    /** EPUB：移除章节内页原图（某些旧书每章都带一张巨大的相同图片） */
    removeImages?: boolean;
    /** EPUB：图片起始编号，批量合并时用于避免 id 冲突 */
    imageStartId?: number;
    /** TXT：章节切分正则 */
    splitRegex?: string;
}

/** 按扩展名判断文件类型；不认识则返回 null */
export const detectImportKind = (filename: string): ImportableKind | null => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.epub')) return 'epub';
    if (lower.endsWith('.txt')) return 'txt';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
    return null;
};

const readAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve((event.target?.result as string) ?? '');
        reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
        reader.readAsText(file);
    });

/** 文件名去掉扩展名，用作书名 */
const titleFromFilename = (filename: string, kind: ImportableKind): string => {
    if (kind === 'epub') return filename.replace(/\.epub$/i, '');
    if (kind === 'txt') return filename.replace(/\.txt$/i, '');
    return filename.replace(/\.(html|htm)$/i, '');
};

/** HTML 标签转义，用于把书名写进正文标题时避免破坏结构 */
const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/**
 * 解析单个文件为完整 ProjectData。
 *
 * 返回的数据已用 normalizeProject 补齐字段，可直接写入书库。
 */
export const parseFileToProject = async (
    file: File,
    options: ImportOptions = {},
): Promise<{ project: ProjectData; kind: ImportableKind }> => {
    const kind = detectImportKind(file.name);
    if (!kind) {
        throw new Error(`不支持的文件类型：${file.name}（仅支持 .epub / .txt / .html）`);
    }

    const base = getInitialState();
    const title = titleFromFilename(file.name, kind);

    if (kind === 'epub') {
        const parsed = await parseEpub(file, {
            imageStartId: options.imageStartId ?? 1,
            cleanHtml: options.cleanHtml,
            removeImages: options.removeImages,
        });

        // 导入的数据带着书名与作者，但结构可能缺字段，统一补齐
        const project = normalizeProject(parsed as Partial<ProjectData>);
        if (!project.metadata.title?.trim()) {
            project.metadata = { ...project.metadata, title };
        }

        if (!project.chapters || project.chapters.length === 0) {
            throw new Error('EPUB 中未解析到任何章节');
        }

        return { project, kind };
    }

    const text = await readAsText(file);

    if (kind === 'txt') {
        const parsed = parseTxtToChapters(text, options.splitRegex);
        const chapters: Chapter[] = parsed.map((c) => ({
            id: generateUniqueId(),
            title: c.title,
            content: c.content,
            level: c.level,
            subItems: [],
        }));

        if (chapters.length === 0) {
            throw new Error('TXT 中未解析到任何章节');
        }

        return {
            project: normalizeProject({
                ...base,
                metadata: { ...base.metadata, title, creator: '未知作者' },
                chapters,
            }),
            kind,
        };
    }

    // HTML
    const chapters = parseHtmlToChapters(text);
    if (chapters.length === 0) {
        throw new Error('HTML 中未解析到任何章节');
    }

    return {
        project: normalizeProject({
            ...base,
            metadata: { ...base.metadata, title, creator: '未知作者' },
            chapters,
        }),
        kind,
    };
};

/**
 * 把多本书稿合并成一本（多卷合一）。
 *
 * 每本书的章节降为二级，并在前面插入一个一级「分卷」标题；
 * 图片 id 依次续号，避免不同书的图片互相覆盖。
 * 元数据与封面取自主书（primaryIndex 指向的那本）。
 */
export const mergeProjects = (
    entries: Array<{ project: ProjectData; label: string }>,
    primaryIndex: number,
): ProjectData => {
    const base = getInitialState();
    let mergedChapters: Chapter[] = [];
    let mergedImages = base.images;
    let mergedExtraFiles = base.extraFiles;
    let mergedCustomCSS = '';
    const shouldGroup = entries.length > 1;

    let primary = entries[primaryIndex]?.project ?? null;
    let cover: string | null = null;
    let coverId: string | null = null;
    let globalImageCount = 0;

    entries.forEach((entry, index) => {
        const bookTitle = entry.project.metadata?.title?.trim() || entry.label;

        // 图片续号：不同书里的图片 id 都是从 001 开始的，直接拼会撞号
        const idRemap = new Map<string, string>();
        const bookImages = (entry.project.images || []).map((img) => {
            const nextId = String(globalImageCount + 1).padStart(3, '0');
            globalImageCount += 1;
            idRemap.set(img.id, nextId);
            return { ...img, id: nextId };
        });

        // 章节正文里引用了图片 id，续号后要同步替换，否则图片会变「缺失」
        const remapChapterContent = (content: string): string => {
            if (idRemap.size === 0 || !content) return content;
            let result = content;
            for (const [oldId, newId] of idRemap.entries()) {
                result = result
                    .replace(new RegExp(`data-id="${oldId}"`, 'g'), `data-id="${newId}"`)
                    .replace(new RegExp(`title="${oldId}"`, 'g'), `title="${newId}"`);
            }
            return result;
        };

        const chapterBase = { idRemap, remap: remapChapterContent };

        const bookChapters = (entry.project.chapters || []).map((chapter) => ({
            ...chapter,
            id: generateUniqueId(),
            content: chapterBase.remap(chapter.content),
            level: 2 as const,
        }));

        if (bookChapters.length > 0 && shouldGroup) {
            mergedChapters = [
                ...mergedChapters,
                {
                    id: generateUniqueId(),
                    title: bookTitle,
                    content: `<h1>${escapeHtml(bookTitle)}</h1>`,
                    level: 1 as const,
                    subItems: [],
                },
                ...bookChapters,
            ];
        } else if (bookChapters.length > 0) {
            mergedChapters = [...mergedChapters, ...bookChapters];
        }

        mergedImages = [...mergedImages, ...bookImages];
        if (entry.project.extraFiles?.length) {
            mergedExtraFiles = [...mergedExtraFiles, ...entry.project.extraFiles];
        }
        if (entry.project.customCSS) {
            mergedCustomCSS += `\n/* From ${entry.label} */\n${entry.project.customCSS}`;
        }

        if (index === primaryIndex) {
            primary = entry.project;
            cover = entry.project.cover ?? null;
            coverId = entry.project.coverId ?? null;
        }
    });

    const metadata = primary?.metadata ?? base.metadata;

    return normalizeProject({
        ...base,
        metadata: {
            ...metadata,
            title: shouldGroup ? `${metadata.title || '合集'}（合集）` : metadata.title,
        },
        chapters: mergedChapters,
        images: mergedImages,
        extraFiles: mergedExtraFiles,
        cover,
        coverId,
        customCSS: mergedCustomCSS || base.customCSS,
        activeStyleId: primary?.activeStyleId ?? base.activeStyleId,
        isPresetStyleActive: primary?.isPresetStyleActive ?? base.isPresetStyleActive,
    });
};
