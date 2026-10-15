/**
 * 项目数据默认值
 *
 * 从 useProject 中抽出，供书籍库（utils/bookLibrary）与 useProject 共同使用。
 * 单独成文件是为了避免循环依赖：useProject 需要读取书籍库，而书籍库在
 * 新建空白书时又需要这份初始数据。
 */

import { ProjectData, CoverDesign } from '../types';

export const INITIAL_COVER_DESIGN: CoverDesign = {
    layoutMode: 'text-over',
    fontFamilyTitle: 'serif',
    fontSizeTitle: 48,
    fontColorTitle: '#ffffff',
    fontWeightTitle: 'bold',
    letterSpacingTitle: 0,
    fontFamilyAuthor: 'sans-serif',
    fontSizeAuthor: 24,
    fontColorAuthor: '#f3f4f6',
    textAlign: 'center',
    verticalOffset: 0,
    overlayOpacity: 0.3,
    textShadow: true,
    borderStyle: 'none',
    backgroundCSS: 'background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);',
    showSeries: false
};

export const getInitialState = (): ProjectData => ({
    metadata: {
        title: '未命名书籍',
        creator: '未知作者',
        language: 'zh',
        description: '',
        publisher: '',
        date: new Date().toISOString().split('T')[0],
        series: '',
        subjects: []
    },
    chapters: [],
    images: [],
    extraFiles: [],
    cover: null,
    coverId: null,
    coverCustomCSS: '',
    coverDesign: { ...INITIAL_COVER_DESIGN },
    activeStyleId: 'classic',
    isPresetStyleActive: true,
    customCSS: '',
    coverGeneratorState: {
        selectedBgImageId: null,
        activeTemplateIndex: 0,
        showTextOnCover: true
    },
    customTocTitle: undefined,
    customTocXhtml: undefined
});

/**
 * 把外部读到的（可能缺字段的）数据补齐成完整 ProjectData。
 *
 * 老版本存档、导入的数据都可能缺少后来新增的字段，这里统一兜底，
 * 避免各调用方各写一份合并逻辑。
 */
export const normalizeProject = (saved: Partial<ProjectData> | null | undefined): ProjectData => {
    const base = getInitialState();
    if (!saved) return base;

    return {
        ...base,
        ...saved,
        coverDesign: saved.coverDesign || { ...INITIAL_COVER_DESIGN },
        extraFiles: saved.extraFiles || [],
        images: saved.images || [],
        chapters: saved.chapters || [],
        isPresetStyleActive: saved.isPresetStyleActive !== undefined ? saved.isPresetStyleActive : true,
        coverGeneratorState: saved.coverGeneratorState || base.coverGeneratorState,
    };
};
