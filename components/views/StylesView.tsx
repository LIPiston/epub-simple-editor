import React, { useState } from 'react';
import { Code, X, Plus, ChevronDown, ChevronUp, BookTemplate, Info, ArrowRight } from 'lucide-react';
import { ProjectData, Chapter } from '../../types';
import { contentToEditorHTML } from '../text-editor/editorHelpers';
import { getTocTitle } from '../../services/toc';
import { PRESET_STYLES } from '../../themes';

interface StylesViewProps {
    project: ProjectData;
    activeChapter: Chapter | undefined;
    onUpdateProject: (updates: Partial<ProjectData>) => void;
}

interface SnippetItem {
    name: string;
    code: string;
    description: string;
    epubUsage: string;
}

const STYLE_SNIPPETS: { category: string; items: SnippetItem[] }[] = [
    {
        category: '排版基础',
        items: [
            {
                name: '标准缩进',
                description: '为每个段落的第一行添加 2 个字符的缩进。',
                epubUsage: '这是中文电子书最标准的排版方式。兼容所有阅读器。',
                code: `/* 段落首行缩进2字符 */
p {
  text-indent: 2em;
  margin-bottom: 0;
  line-height: 1.8;
}`
            },
            {
                name: '段落间距',
                description: '段落之间不缩进，而是通过垂直间距来区分。',
                epubUsage: '常用于现代小说或西文排版。注意：部分旧设备可能强制添加缩进，需配合 text-indent: 0 使用。',
                code: `/* 段落之间增加间距 (无缩进) */
p {
  text-indent: 0;
  margin-bottom: 1em;
  line-height: 1.6;
}`
            },
            {
                name: '首段不缩进',
                description: '取消章节标题后第一个段落的缩进。',
                epubUsage: '常见于西文出版物设计。使用相邻兄弟选择器实现。',
                code: `/* 标题后的第一段不缩进 */
h1 + p, h2 + p {
  text-indent: 0;
}`
            },
            {
                name: '强制分页',
                description: '在章节标题前强制插入分页符。',
                epubUsage: '虽然 EPUB 通常会自动为章节文件分页，但在合并章节模式下此属性非常关键。',
                code: `/* 章节标题前强制分页 */
h1 {
  page-break-before: always;
}`
            }
        ]
    },
    {
        category: '装饰元素',
        items: [
            {
                name: '首字下沉',
                description: '放大段落的第一个字并使其下沉占多行高度。',
                epubUsage: '使用 ::first-letter 伪元素。注意：在 Kindle 等旧版墨水屏设备上支持可能不完美，建议测试。',
                code: `/* 第一段首字下沉 */
h1 + p::first-letter {
  font-size: 3em;
  float: left;
  line-height: 1;
  margin-right: 0.15em;
  font-weight: bold;
}`
            },
            {
                name: '引用样式',
                description: '为引用文本块添加左侧边框和背景色。',
                epubUsage: '使用 blockquote 标签。这是一种非常安全的样式，兼容性极佳。',
                code: `/* 引用块样式 */
blockquote {
  border-left: 4px solid #ccc;
  background-color: #f9f9f9;
  margin: 1.5em 1em;
  padding: 0.8em 1em;
  color: #555;
  font-style: italic;
}`
            },
            {
                name: '星号分割',
                description: '在水平分割线的位置显示星号装饰。',
                epubUsage: '使用伪元素 ::before 插入内容。部分极简阅读器可能不显示伪元素内容，但基本线条会保留。',
                code: `/* 星号分割线 */
hr {
  border: 0;
  text-align: center;
  margin: 2em auto;
}
hr:before {
  content: "* * *";
  font-size: 1.5em;
  color: #888;
}`
            },
            {
                name: '竖排文字',
                description: '将文字排列方式改为从上到下、从右到左。',
                epubUsage: '古籍风格必备。注意：对阅读器要求较高（需支持 CSS3 writing-mode），在 Apple Books 上效果最好，老旧设备可能失效。',
                code: `/* 竖排文字 (古籍模式) */
body {
  writing-mode: vertical-rl;
  -webkit-writing-mode: vertical-rl;
  text-orientation: upright;
  margin: 2em;
  height: auto;
}
/* 提示：竖排时数字需横向处理或使用中文数字 */`
            }
        ]
    },
    {
        category: '图片与代码',
        items: [
            {
                name: '图片美化',
                description: '为图片添加圆角和阴影，使其看起来像一张照片卡片。',
                epubUsage: 'box-shadow 在 e-ink 设备上可能不可见，但在手机/平板阅读器上效果很好。',
                code: `/* 图片圆角与阴影 */
img {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  margin: 1.5em auto;
  display: block;
}`
            },
            {
                name: '图注说明',
                description: '专门用于图片下方文字的样式，字体较小且居中。',
                epubUsage: '建议在 HTML 中使用 <p class="caption"> 包裹图注文字。',
                code: `/* 图片下方的注释文字 */
.caption {
  font-size: 0.85em;
  color: #666;
  text-align: center;
  margin-top: -1em;
  margin-bottom: 2em;
}`
            },
            {
                name: '代码块',
                description: '为代码片段提供等宽字体、背景色和滚动条。',
                epubUsage: 'pre 标签结合 overflow-x: auto 可以防止长代码撑破屏幕布局。',
                code: `/* 代码块样式 */
pre {
  background: #f4f4f4;
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid #ddd;
  font-family: monospace;
}`
            }
        ]
    }
];

const StylesView: React.FC<StylesViewProps> = ({ project, activeChapter, onUpdateProject }) => {
    const [stylePreviewMode, setStylePreviewMode] = useState<'chapter' | 'toc'>('chapter');
    const [showSnippets, setShowSnippets] = useState(false);

    // Snippet Info Modal State
    const [infoSnippet, setInfoSnippet] = useState<SnippetItem | null>(null);

    const isPresetActive = project.isPresetStyleActive !== false;

    const insertSnippet = (code: string) => {
        const current = project.customCSS || '';
        const separator = current && !current.endsWith('\n') ? '\n\n' : '';
        onUpdateProject({ customCSS: current + separator + code });
        setInfoSnippet(null);
    };

    const handleTogglePresetStyle = () => {
        onUpdateProject({ isPresetStyleActive: !isPresetActive });
    };

    // Preview Logic
    let previewContent = '';
    const activeStyle = PRESET_STYLES.find(s => s.id === project.activeStyleId);
    const tocTitle = project.customTocTitle?.trim() || getTocTitle(project.chapters);

    if (stylePreviewMode === 'chapter') {
        previewContent = activeChapter 
            ? contentToEditorHTML(activeChapter.content, project.images)
            : `
        <h1>示例章节标题</h1>
        <p>这是一个预览段落。请选择一个章节以查看实际效果，或者在此查看默认样式的表现。</p>
        <p>这是第二段，用于展示段落间距或缩进效果。这里包含 <strong>加粗(Bold)</strong>、<em>斜体(Italic)</em>、<u>下划线</u> 和 <s>删除线</s>。</p>
        <p>这是一个 <a href="#">超链接样式示例</a>。</p>
        <blockquote>“这是一个引用块的示例文字。通常用于摘录或强调。”</blockquote>
        <hr/>
        <p>下方是各种分割线示例：</p>
        <hr class="divider-1"/>
        <hr class="divider-2"/>
        <hr class="divider-3"/>
        <hr class="divider-4"/>
        <hr class="divider-5"/>
        <p>下方是图片示例：</p>
        <div style="background:#eee;height:120px;display:flex;align-items:center;justify-content:center;color:#999;border:1px dashed #ccc;margin:1em 0;border-radius:4px;">[图片占位]</div>
        <p class="caption">图1.1 示例图片说明</p>
        <ul>
            <li>列表项目 A</li>
            <li>列表项目 B</li>
        </ul>
      `;
    } else {
        const tocItems = project.chapters.map((c, index) => {
            const levelClass = c.level === 2 ? 'toc-level-2' : 'toc-level-1';
            return `<li class="toc-item ${levelClass}"><a class="toc-link" href="#">${c.title}</a></li>`;
        }).join('');
        previewContent = `<h1>目录</h1><ul class="toc-list">${tocItems || '<li class="toc-item">暂无章节</li>'}</ul>`;
    }

    if (stylePreviewMode === 'toc') {
        previewContent = previewContent.replace(/<h1>.*?<\/h1>/, `<h1>${tocTitle}</h1>`);
        previewContent = previewContent.replace('鏆傛棤绔犺妭', '暂无章节');
    }

    previewContent = previewContent.replace('鏆傛棤绔犺妭', '暂无章节');

    const safeCustomCSS = project.customCSS.replace(/<\/style>/gi, '<\\/style>');
    // Include Extra Files CSS
    const extraCssContent = project.extraFiles?.filter(f => f.type === 'css' && f.isActive !== false).map(f => f.content).join('\n') || '';
    const safeExtraCSS = extraCssContent.replace(/<\/style>/gi, '<\\/style>');

    const presetCss = isPresetActive ? (activeStyle?.css || '') : '/* Preset style disabled */';
    const iframeSrc = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>html, body { margin: 0; padding: 0; min-height: 100%; width: 100%; box-sizing: border-box; } ${presetCss} ${safeCustomCSS} ${safeExtraCSS}</style></head><body>${previewContent}</body></html>`;

    return (
        <div className="flex flex-col md:flex-row h-full bg-gray-50 relative dark:bg-gray-900">
            {/* Left control column */}
            <div className="w-full md:w-80 flex-none flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white overflow-hidden z-10 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex-1 overflow-y-auto">
                    {/* Sticky toolbar */}
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">样式主题</h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500">Styles</span>
                    </div>

                    <div className="p-3 space-y-4">
                        {/* Preset styles */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">预设主题</h3>
                                <label className="flex items-center cursor-pointer gap-2">
                                    <span className={`text-[11px] ${isPresetActive ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {isPresetActive ? '已启用' : '已停用'}
                                    </span>
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only peer" checked={isPresetActive} onChange={handleTogglePresetStyle} />
                                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600 dark:bg-gray-700 dark:peer-checked:bg-gray-600"></div>
                                    </div>
                                </label>
                            </div>
                            <div className={`grid grid-cols-2 gap-1.5 transition-opacity ${!isPresetActive ? 'opacity-40 pointer-events-none' : ''}`}>
                                {PRESET_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => onUpdateProject({ activeStyleId: style.id })}
                                        className={`text-xs py-1.5 rounded-md border transition-colors ${project.activeStyleId === style.id
                                            ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        {style.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preview mode segmented control */}
                        <div className="flex border border-gray-200 rounded-md overflow-hidden dark:border-gray-700">
                            <button
                                onClick={() => setStylePreviewMode('chapter')}
                                className={`flex-1 h-7 text-[11px] transition-colors ${stylePreviewMode === 'chapter' ? 'bg-gray-100 text-gray-900 font-medium dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                            >
                                正文预览
                            </button>
                            <button
                                onClick={() => setStylePreviewMode('toc')}
                                className={`flex-1 h-7 text-[11px] border-l border-gray-200 transition-colors dark:border-gray-700 ${stylePreviewMode === 'toc' ? 'bg-gray-100 text-gray-900 font-medium dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                            >
                                目录预览
                            </button>
                        </div>

                        {/* Custom CSS */}
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => setShowSnippets(!showSnippets)}>
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center dark:text-gray-500">
                                    <Code size={13} className="mr-1.5 text-gray-400 dark:text-gray-500" /> 自定义 CSS
                                </h3>
                                <span className="text-[11px] text-gray-500 flex items-center hover:text-orange-600 transition-colors dark:text-gray-400 dark:hover:text-gray-300">
                                    <BookTemplate size={12} className="mr-1" />
                                    {showSnippets ? '隐藏代码库' : '展开代码库'}
                                    {showSnippets ? <ChevronUp size={12} className="ml-1" /> : <ChevronDown size={12} className="ml-1" />}
                                </span>
                            </div>

                            {/* CSS Snippets library */}
                            {showSnippets && (
                                <div className="mb-2 border border-gray-200 rounded-md divide-y divide-gray-100 dark:border-gray-700 dark:divide-gray-800">
                                    {STYLE_SNIPPETS.map((category, catIdx) => (
                                        <div key={catIdx} className="p-2">
                                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500">{category.category}</h4>
                                            <div className="flex flex-wrap gap-1">
                                                {category.items.map((snippet, idx) => (
                                                    <div key={idx} className="group flex items-center">
                                                        <button
                                                            onClick={() => insertSnippet(snippet.code)}
                                                            className="flex items-center text-[11px] bg-white border border-gray-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600 text-gray-600 pl-1.5 pr-1 py-0.5 rounded-l-md transition-colors max-w-full dark:bg-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300"
                                                        >
                                                            <Plus size={10} className="mr-1 flex-shrink-0" />
                                                            <span className="truncate">{snippet.name}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setInfoSnippet(snippet)}
                                                            className="flex items-center border border-l-0 border-gray-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 text-gray-400 px-1 py-0.5 rounded-r-md transition-colors dark:border-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:border-gray-600 dark:hover:text-gray-300"
                                                            title="查看详情"
                                                        >
                                                            <Info size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <textarea
                                className="w-full min-h-[220px] flex-1 bg-gray-900 text-orange-400 font-mono text-[11px] p-2.5 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                                placeholder="/* 输入 CSS 覆盖样式，或使用上方按钮插入常用样式 */"
                                value={project.customCSS}
                                onChange={(e) => onUpdateProject({ customCSS: e.target.value })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview panel */}
            <div className="flex-1 bg-gray-100 overflow-y-auto flex justify-center p-3 dark:bg-gray-800">
                <div className="w-full max-w-[800px] h-[600px] md:h-[1000px] bg-white border border-gray-200 rounded-md overflow-hidden dark:border-gray-700">
                    <iframe title="Style Preview" srcDoc={iframeSrc} className="w-full h-full border-none" />
                </div>
            </div>

            {/* Snippet Info Modal */}
            {infoSnippet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
                    <div className="bg-white rounded-md border border-gray-200 w-full max-w-md overflow-hidden flex flex-col dark:bg-gray-900 dark:border-gray-800">
                        <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center dark:border-gray-800">
                            <div className="flex items-center gap-2">
                                <Code size={14} className="text-gray-400 dark:text-gray-500" />
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{infoSnippet.name}</h3>
                            </div>
                            <button
                                onClick={() => setInfoSnippet(null)}
                                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800"
                                title="关闭"
                                aria-label="关闭"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-3 space-y-3">
                            <div>
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 dark:text-gray-500">功能描述</h4>
                                <p className="text-[13px] text-gray-700 leading-relaxed dark:text-gray-300">{infoSnippet.description}</p>
                            </div>

                            <div className="bg-orange-50 border border-orange-100 rounded-md p-2.5 dark:bg-gray-800 dark:border-gray-700">
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-orange-600 mb-1 flex items-center dark:text-gray-300">
                                    <Info size={11} className="mr-1" /> EPUB 兼容性
                                </h4>
                                <p className="text-[11px] text-orange-800 leading-relaxed dark:text-gray-100">{infoSnippet.epubUsage}</p>
                            </div>

                            <div>
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500">代码预览</h4>
                                <div className="bg-gray-900 rounded-md p-2.5">
                                    <pre className="text-[11px] font-mono text-orange-400 overflow-x-auto whitespace-pre-wrap break-all">
                                        {infoSnippet.code}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div className="px-3 py-2 border-t border-gray-200 flex justify-end gap-2 dark:border-gray-800">
                            <button
                                onClick={() => setInfoSnippet(null)}
                                className="h-7 px-3 text-xs border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 rounded-md transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                                关闭
                            </button>
                            <button
                                onClick={() => insertSnippet(infoSnippet.code)}
                                className="h-7 px-3 text-xs bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center dark:bg-gray-600 dark:hover:bg-gray-500"
                            >
                                应用到预览 <ArrowRight size={12} className="ml-1.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StylesView;
