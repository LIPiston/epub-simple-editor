import React, { useRef, useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import { ProjectData, CoverDesign, ImageAsset, CoverGeneratorState } from '../../../types';
import { Upload, Camera, Type, Check, Code, Loader2, Library, X, ChevronDown, ChevronUp, Palette, Plus, Info } from 'lucide-react';

interface CoverGeneratorProps {
  project: ProjectData;
  onUpdateCover: (dataUrl: string | null, coverId?: string | null) => void;
  onUpdateCoverCSS: (css: string) => void;
  onUpdateCoverDesign?: (design: CoverDesign) => void;
  onAddImage?: (image: ImageAsset) => void;
  coverGeneratorState?: CoverGeneratorState;
  onUpdateGeneratorState?: (state: Partial<CoverGeneratorState>) => void;
}

// --- Configuration Types ---
type FieldType = 'color' | 'number' | 'range' | 'select';

interface SnippetField {
  key: string;
  label: string;
  type: FieldType;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  unit?: string;
}

interface SnippetTemplate {
  id: string;
  name: string;
  selector: string;
  description?: string;
  fields: SnippetField[];
  generate: (values: any) => string;
}

// --- Predefined Snippets ---
const SNIPPET_TEMPLATES: SnippetTemplate[] = [
  {
    id: 'gradient_bg',
    name: '渐变背景',
    selector: '#cover-preview',
    fields: [
      { key: 'color1', label: '起始颜色', type: 'color', default: '#667eea' },
      { key: 'color2', label: '结束颜色', type: 'color', default: '#764ba2' },
      { key: 'angle', label: '角度', type: 'range', min: 0, max: 360, default: 135, unit: 'deg' }
    ],
    generate: (v) => `background: linear-gradient(${v.angle}deg, ${v.color1} 0%, ${v.color2} 100%);`
  },
  {
    id: 'text_glow',
    name: '文字发光',
    selector: '#cover-title',
    fields: [
      { key: 'color', label: '光晕颜色', type: 'color', default: '#ffffff' },
      { key: 'blur', label: '模糊半径', type: 'range', min: 0, max: 50, default: 10, unit: 'px' }
    ],
    generate: (v) => `text-shadow: 0 0 ${v.blur}px ${v.color}, 0 0 ${v.blur * 2}px ${v.color};`
  },
  {
    id: 'glass',
    name: '磨砂标题',
    selector: '#cover-title',
    fields: [
      { key: 'bgColor', label: '背景颜色', type: 'color', default: '#ffffff' },
      { key: 'opacity', label: '不透明度', type: 'range', min: 0, max: 1, step: 0.1, default: 0.2 },
      { key: 'blur', label: '模糊程度', type: 'range', min: 0, max: 20, default: 8, unit: 'px' },
      { key: 'radius', label: '圆角', type: 'number', default: 12, unit: 'px' }
    ],
    generate: (v) => {
      const hex = v.bgColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `background: rgba(${r}, ${g}, ${b}, ${v.opacity});
backdrop-filter: blur(${v.blur}px);
-webkit-backdrop-filter: blur(${v.blur}px);
padding: 20px;
border-radius: ${v.radius}px;
border: 1px solid rgba(255, 255, 255, 0.3);`;
    }
  },
  {
    id: 'border_frame',
    name: '内框线',
    selector: '#cover-preview',
    fields: [
      { key: 'color', label: '边框颜色', type: 'color', default: '#ffffff' },
      { key: 'width', label: '粗细', type: 'number', default: 2, unit: 'px' },
      { key: 'offset', label: '内缩距离', type: 'number', default: 16, unit: 'px' }
    ],
    generate: (v) => `outline: ${v.width}px solid ${v.color};
outline-offset: -${v.offset}px;`
  },
  {
    id: 'vignette',
    name: '暗角压暗',
    selector: '#cover-preview',
    fields: [
      { key: 'color', label: '暗角颜色', type: 'color', default: '#000000' },
      { key: 'intensity', label: '强度', type: 'range', min: 0, max: 100, default: 40, unit: '%' }
    ],
    generate: (v) => `box-shadow: inset 0 0 150px rgba(0,0,0, ${v.intensity / 100});`
  },
  {
    id: 'retro_grid',
    name: '复古网格',
    selector: '#cover-preview',
    fields: [
      { key: 'color', label: '线条颜色', type: 'color', default: '#ffffff' },
      { key: 'opacity', label: '透明度', type: 'range', min: 0.05, max: 0.5, step: 0.05, default: 0.1 },
      { key: 'size', label: '网格大小', type: 'number', default: 40, unit: 'px' }
    ],
    generate: (v) => {
      const hex = v.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const rgba = `rgba(${r},${g},${b},${v.opacity})`;
      return `background-image: 
linear-gradient(${rgba} 1px, transparent 1px),
linear-gradient(90deg, ${rgba} 1px, transparent 1px);
background-size: ${v.size}px ${v.size}px;`;
    }
  },
  {
    id: '3d_text',
    name: '立体文字',
    selector: '#cover-title',
    fields: [
      { key: 'color', label: '阴影颜色', type: 'color', default: '#555555' }
    ],
    generate: (v) => `text-shadow: 
1px 1px 0 ${v.color},
2px 2px 0 ${v.color},
3px 3px 0 ${v.color},
4px 4px 0 ${v.color};`
  },
  {
    id: 'author_deco',
    name: '作者修饰',
    selector: '#cover-author',
    fields: [
      { key: 'color', label: '线条颜色', type: 'color', default: '#ffffff' },
      { key: 'spacing', label: '字间距', type: 'number', default: 4, unit: 'px' }
    ],
    generate: (v) => `border-top: 1px solid ${v.color};
padding-top: 8px;
margin-top: 8px;
letter-spacing: ${v.spacing}px;
display: inline-block;`
  }
];

const CoverGenerator: React.FC<CoverGeneratorProps> = ({
  project,
  onUpdateCover,
  onUpdateCoverCSS,
  onUpdateCoverDesign,
  onAddImage,
  coverGeneratorState,
  onUpdateGeneratorState
}) => {
  const coverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'success'>('idle');
  const [showCssEditor, setShowCssEditor] = useState(false); // Default hidden

  // Initialize state from props or defaults
  // Allow -1 to represent no template selected
  const [activeTemplate, setActiveTemplate] = useState(coverGeneratorState?.activeTemplateIndex ?? 0);
  const [selectedBgImageId, setSelectedBgImageId] = useState<string | null>(coverGeneratorState?.selectedBgImageId || null);
  const [showTextOnCover, setShowTextOnCover] = useState(coverGeneratorState?.showTextOnCover !== undefined ? coverGeneratorState.showTextOnCover : true);
  const [selectedBgImage, setSelectedBgImage] = useState<string | null>(null);

  // --- Snippet Modal State ---
  const [activeSnippet, setActiveSnippet] = useState<SnippetTemplate | null>(null);
  const [snippetValues, setSnippetValues] = useState<Record<string, any>>({});

  // Resolve Background Image Data on Mount or ID Change
  useEffect(() => {
    if (selectedBgImageId) {
      const img = project.images.find(i => i.id === selectedBgImageId);
      if (img) setSelectedBgImage(img.data);
    } else {
      setSelectedBgImage(null);
    }
  }, [selectedBgImageId, project.images]);

  // Sync state for legacy projects or pure image overrides
  useEffect(() => {
    // If we don't have stored generator state, but we DO have a coverId (pure image), restore that state
    if (!coverGeneratorState && project.coverId) {
      setSelectedBgImageId(project.coverId);
      setShowTextOnCover(false);
      // Sync back to store
      onUpdateGeneratorState?.({
        selectedBgImageId: project.coverId,
        showTextOnCover: false
      });
    }
  }, []);

  // Update handlers that also sync to parent state
  const handleSetSelectedBgImageId = (id: string | null) => {
    setSelectedBgImageId(id);
    onUpdateGeneratorState?.({ selectedBgImageId: id });
  };

  const handleSetShowTextOnCover = (show: boolean) => {
    setShowTextOnCover(show);
    onUpdateGeneratorState?.({ showTextOnCover: show });
  };

  const handleSetActiveTemplate = (idx: number) => {
    // Toggle: If clicking active one, deselect it (set to -1)
    const nextIdx = activeTemplate === idx ? -1 : idx;
    setActiveTemplate(nextIdx);
    onUpdateGeneratorState?.({ activeTemplateIndex: nextIdx });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;

          // Create an ImageAsset for this upload to enable referencing
          const img = new Image();
          img.onload = () => {
            // Calculate ID
            let maxId = 0;
            project.images.forEach(i => {
              const n = parseInt(i.id, 10);
              if (!isNaN(n) && n > maxId) maxId = n;
            });
            const newId = (maxId + 1).toString().padStart(3, '0');

            const asset: ImageAsset = {
              id: newId,
              name: file.name,
              data: dataUrl,
              type: file.type,
              dimensions: `${img.naturalWidth} × ${img.naturalHeight}`,
              size: file.size
            };

            // 1. Add to library (so it becomes a reusable asset)
            if (onAddImage) {
              onAddImage(asset);
            }

            // 2. Set as cover (by reference ID)
            onUpdateCover(dataUrl, asset.id);

            // 3. Update local and persistent state
            setSelectedBgImage(dataUrl);
            handleSetSelectedBgImageId(asset.id);
          };
          img.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectImageFromLibrary = (image: ImageAsset) => {
    setSelectedBgImage(image.data);
    handleSetSelectedBgImageId(image.id);

    // Auto-apply if in pure image mode
    if (!showTextOnCover) {
      onUpdateCover(image.data, image.id);
    }
  };

  const clearBackground = () => {
    setSelectedBgImage(null);
    handleSetSelectedBgImageId(null);
  };

  const generateCover = async () => {
    if (coverRef.current && status !== 'generating') {
      try {
        setStatus('generating');
        await new Promise(resolve => setTimeout(resolve, 100));

        const dataUrl = await htmlToImage.toJpeg(coverRef.current, {
          quality: 0.85,
          pixelRatio: 1
        });

        // When generating from HTML composition, it MUST be a new image (cover.png), so coverId is null.
        // This is expected behavior for compositions.
        onUpdateCover(dataUrl, null);
        setStatus('success');

        setTimeout(() => setStatus('idle'), 2000);
      } catch (error) {
        console.error('Error generating cover:', error);
        setStatus('idle');
      }
    }
  };

  // --- Snippet Logic ---
  const toggleSnippetPopup = (template: SnippetTemplate) => {
    if (activeSnippet?.id === template.id) {
      setActiveSnippet(null);
    } else {
      const defaults: Record<string, any> = {};
      template.fields.forEach(f => defaults[f.key] = f.default);
      setSnippetValues(defaults);
      setActiveSnippet(template);
    }
  };

  const confirmSnippet = () => {
    if (!activeSnippet) return;
    const cssRule = activeSnippet.generate(snippetValues);
    const fullCss = `/* ${activeSnippet.name} */\n${activeSnippet.selector} {\n  ${cssRule.replace(/\n/g, '\n  ')}\n}`;

    const current = project.coverCustomCSS || '';
    const sep = current && !current.endsWith('\n') ? '\n\n' : '';
    onUpdateCoverCSS(current + sep + fullCss);

    setActiveSnippet(null);
  };

  const handleToggleSeries = () => {
    if (onUpdateCoverDesign) {
      onUpdateCoverDesign({
        ...project.coverDesign!,
        showSeries: !project.coverDesign?.showSeries
      });
    }
  };

  const templates = [
    { name: "商务蓝", bg: 'bg-gradient-to-br from-orange-900 to-gray-900', text: 'text-white', font: 'font-serif', series: 'text-white/60' },
    { name: "文艺粉", bg: 'bg-gradient-to-tr from-rose-100 to-orange-100', text: 'text-gray-800', font: 'font-sans', series: 'text-gray-500' },
    { name: "极客黑", bg: 'bg-gray-800', text: 'text-orange-500', font: 'font-mono', series: 'text-orange-500/50' },
    { name: "经典白", bg: 'bg-white border-8 border-double border-gray-900', text: 'text-black', font: 'font-serif', series: 'text-gray-400' },
  ];

  // Fallback for when no template is selected (index -1)
  const defaultTemplate = {
    name: "默认",
    bg: 'bg-white',
    text: 'text-gray-900',
    font: 'font-sans',
    series: 'text-gray-400'
  };

  const currentTemplate = (activeTemplate >= 0 && templates[activeTemplate]) ? templates[activeTemplate] : defaultTemplate;

  // Logic to determine if we are in "Direct Image Mode" (Pure Image + Selected BG)
  // In this mode, we check if user wants pure image AND has selected a background
  const isDirectImageMode = !showTextOnCover && selectedBgImage;

  return (
    <div className="h-full flex flex-col md:flex-row bg-gray-50 overflow-y-auto md:overflow-hidden dark:bg-gray-900">

      {/* Left: Controls (compact panel) */}
      <aside className="w-full md:w-[320px] flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-y-visible md:overflow-y-auto custom-scrollbar order-2 md:order-1 dark:bg-gray-900 dark:border-gray-800">

        <section className="px-3 py-2 space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <Upload size={13} className="text-gray-400 dark:text-gray-500" /> 1. 上传或选择图片
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">您可以上传最终封面，或从素材库选择一张图片作为背景。</p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-8 text-xs font-medium text-gray-600 bg-white border border-dashed border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            上传完整封面...
          </button>

          <div>
            <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500"><Library size={12} className="mr-1.5" /> 从素材库选择背景</h4>
            <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto bg-gray-50 p-1.5 rounded-md border border-gray-200 custom-scrollbar dark:bg-gray-900 dark:border-gray-800">
              {project.images.map(img => (
                <button key={img.id} onClick={() => handleSelectImageFromLibrary(img)} className={`aspect-square border rounded-sm overflow-hidden focus:outline-none focus:ring-1 focus:ring-orange-400 ${selectedBgImageId === img.id ? 'border-orange-600 ring-1 ring-orange-200 dark:ring-gray-700' : 'border-gray-200 hover:border-orange-400 dark:border-gray-800'}`}>
                  <img src={img.data} alt={img.name} className="w-full h-full object-cover" />
                </button>
              ))}
              {project.images.length === 0 && <p className="col-span-5 text-[11px] text-center text-gray-400 py-3 dark:text-gray-500">素材库为空</p>}
            </div>
            {selectedBgImage && <button onClick={clearBackground} className="text-[11px] text-gray-500 hover:text-red-500 mt-1.5 flex items-center dark:text-gray-400"><X size={11} className="mr-1" />清除背景</button>}
          </div>
        </section>

        <section className="px-3 py-2 space-y-3 border-t border-gray-200 flex-1 dark:border-gray-800">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <Type size={13} className="text-gray-400 dark:text-gray-500" /> 2. 设计与生成
          </h3>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500">封面模式</label>
            <div className="flex items-center bg-gray-100 rounded-md p-0.5 dark:bg-gray-800">
              <button
                onClick={() => handleSetShowTextOnCover(true)}
                className={`flex-1 h-7 rounded-sm text-xs font-medium transition-colors ${showTextOnCover ? 'bg-white text-orange-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                图文封面
              </button>
              <button
                onClick={() => {
                  handleSetShowTextOnCover(false);
                  if (selectedBgImage) {
                    // Direct reference mode
                    onUpdateCover(selectedBgImage, selectedBgImageId);
                  }
                }}
                className={`flex-1 h-7 rounded-sm text-xs font-medium transition-colors ${!showTextOnCover ? 'bg-white text-orange-600 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                纯图封面
              </button>
            </div>
          </div>

          {showTextOnCover && (
            <>
              {/* 标题大小调整滑块 */}
              <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">标题大小</span>
                  <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{project.coverDesign?.fontSizeTitle ?? 48}px</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={96}
                  step={2}
                  value={project.coverDesign?.fontSizeTitle ?? 48}
                  onChange={(e) => {
                    if (onUpdateCoverDesign && project.coverDesign) {
                      onUpdateCoverDesign({ ...project.coverDesign, fontSizeTitle: Number(e.target.value) });
                    }
                  }}
                  className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-orange-600 mt-1.5 dark:bg-gray-700"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 dark:text-gray-500">
                  <span>小 16px</span>
                  <span>大 96px</span>
                </div>
              </div>

              {/* 显示系列丛书 */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-700 dark:text-gray-300">显示系列丛书</span>
                  {!project.metadata.series && <span className="text-[10px] text-gray-400 flex items-center mt-0.5 dark:text-gray-500"><Info size={10} className="mr-1" /> 需在“书籍信息”中填写</span>}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={project.coverDesign?.showSeries || false} onChange={handleToggleSeries} disabled={!project.metadata.series} />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600 dark:bg-gray-700"></div>
                </label>
              </div>
            </>
          )}

          <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500">预设风格 (点击取消)</label>
            <div className="grid grid-cols-2 gap-1.5">
              {templates.map((t, idx) => (
                <button key={idx} onClick={() => handleSetActiveTemplate(idx)} className={`h-7 w-full rounded-md border text-xs font-medium transition-colors flex items-center justify-center px-2 ${activeTemplate === idx ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-gray-800 dark:text-gray-200' : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-700'}`}><span className={`w-2.5 h-2.5 rounded-full mr-1.5 border border-black/10 ${t.bg}`}></span>{t.name}</button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
            <div
              onClick={() => setShowCssEditor(!showCssEditor)}
              className="flex items-center justify-between cursor-pointer group select-none"
            >
              <span className="text-xs font-semibold text-gray-600 flex items-center dark:text-gray-400">
                <Code size={13} className="mr-1.5 text-gray-400 group-hover:text-orange-500 dark:text-gray-500" />
                {showCssEditor ? '隐藏 CSS 编辑器' : '自定义 CSS (Advanced)'}
              </span>
              {showCssEditor ? <ChevronUp size={13} className="text-gray-400 dark:text-gray-500" /> : <ChevronDown size={13} className="text-gray-400 dark:text-gray-500" />}
            </div>

            {showCssEditor && (
              <div className="mt-2 space-y-2">
                <div className="border border-gray-200 rounded-md p-2 relative bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 dark:text-gray-500">快速添加样式</label>

                  <div className="grid grid-cols-2 gap-1.5 relative">
                    {SNIPPET_TEMPLATES.map((snippet, idx) => {
                      const isActive = activeSnippet?.id === snippet.id;
                      return (
                        <div key={snippet.id} className="relative group/snippet">
                          <button
                            onClick={() => toggleSnippetPopup(snippet)}
                            className={`w-full h-7 px-2 rounded-md border transition-colors flex items-center justify-center gap-1.5 text-xs ${isActive
                              ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-gray-800 dark:text-gray-200'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                              }`}
                          >
                            <Plus size={12} className={isActive ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'} />
                            <span className="font-medium">{snippet.name}</span>
                          </button>

                          {isActive && (
                            <div className={`absolute top-full mt-2 z-50 w-64 bg-white rounded-md border border-gray-200 shadow-sm p-3 dark:bg-gray-900 dark:border-gray-800 ${idx % 2 === 0 ? 'left-0' : 'right-0'}`}>
                              <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-2 dark:border-gray-800">
                                <h4 className="text-[11px] font-semibold text-gray-700 flex items-center dark:text-gray-300">
                                  <Palette size={12} className="mr-1.5 text-gray-400 dark:text-gray-500" /> 配置{snippet.name}
                                </h4>
                                <button onClick={() => setActiveSnippet(null)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-200" title="关闭"><X size={13} /></button>
                              </div>

                              <div className="space-y-2 mb-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                {snippet.fields.map(field => (
                                  <div key={field.key}>
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1 flex justify-between dark:text-gray-400">
                                      <span>{field.label}</span>
                                      {field.type === 'range' && <span className="text-gray-400 font-mono dark:text-gray-500">{snippetValues[field.key]}{field.unit}</span>}
                                    </label>

                                    {field.type === 'color' && (
                                      <div className="flex items-center space-x-1.5">
                                        <input
                                          type="color"
                                          value={snippetValues[field.key] || field.default}
                                          onChange={e => setSnippetValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                          className="h-7 w-7 rounded-md cursor-pointer border border-gray-200 p-0 overflow-hidden dark:border-gray-700"
                                        />
                                        <input
                                          type="text"
                                          value={snippetValues[field.key] || field.default}
                                          onChange={e => setSnippetValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                          className="flex-1 h-7 border border-gray-200 rounded-md px-2 text-xs font-mono uppercase focus:ring-1 focus:ring-orange-500 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                                        />
                                      </div>
                                    )}

                                    {field.type === 'number' && (
                                      <div className="relative">
                                        <input
                                          type="number"
                                          value={snippetValues[field.key] || field.default}
                                          onChange={e => setSnippetValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                                          className="w-full h-7 border border-gray-200 rounded-md px-2 text-xs focus:ring-1 focus:ring-orange-500 outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                                        />
                                        {field.unit && <span className="absolute right-2 top-1.5 text-[10px] text-gray-400 dark:text-gray-500">{field.unit}</span>}
                                      </div>
                                    )}

                                    {field.type === 'range' && (
                                      <input
                                        type="range"
                                        min={field.min}
                                        max={field.max}
                                        step={field.step || 1}
                                        value={snippetValues[field.key] || field.default}
                                        onChange={e => setSnippetValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                                        className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-orange-600 block mt-1.5 dark:bg-gray-700"
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                                <button
                                  onClick={confirmSnippet}
                                  className="w-full h-7 border border-orange-500 text-orange-600 hover:bg-orange-50 text-xs font-semibold rounded-md transition-colors flex items-center justify-center dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  <Check size={13} className="mr-1.5" /> 确认添加
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <textarea
                  className="w-full h-32 bg-gray-900 text-orange-400 font-mono text-[11px] p-2 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y custom-scrollbar"
                  placeholder="/* 输入 CSS */&#10;#cover-preview { ... }&#10;#cover-title { ... }"
                  value={project.coverCustomCSS || ''}
                  onChange={(e) => onUpdateCoverCSS(e.target.value)}
                />
              </div>
            )}
          </div>

          <button onClick={generateCover} disabled={status !== 'idle' || !!isDirectImageMode} className={`w-full h-8 rounded-md flex items-center justify-center text-xs font-semibold text-white transition-colors ${status === 'success' ? 'bg-orange-600' : status === 'generating' ? 'bg-orange-400 cursor-wait' : isDirectImageMode ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400' : 'bg-orange-600 hover:bg-orange-700 dark:bg-gray-600 dark:hover:bg-gray-500'}`}>{status === 'generating' && <Loader2 size={14} className="mr-1.5 animate-spin" />}{status === 'success' && <Check size={14} className="mr-1.5" />}{status === 'idle' && <Camera size={14} className="mr-1.5" />}{status === 'generating' ? '正在渲染...' : status === 'success' ? '封面已更新!' : isDirectImageMode ? '已自动应用图片封面' : '生成并应用封面'}</button>
        </section>
      </aside>

      <div className="flex-1 bg-gray-50 border-t md:border-t-0 border-gray-200 flex flex-col items-center justify-center p-6 relative overflow-hidden order-1 md:order-2 min-h-[400px] dark:bg-gray-900 dark:border-gray-800">
        <div className="relative group mb-6 transform scale-75 md:scale-100 transition-transform origin-center">
          <div className="absolute -inset-4 bg-white/40 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div
            id="cover-preview"
            ref={coverRef}
            className={`w-[320px] h-[480px] flex flex-col items-center justify-center p-8 text-center transition-all duration-300 relative overflow-hidden ${!selectedBgImage ? currentTemplate.bg : ''}`}
            style={{ minWidth: '320px', minHeight: '480px', backgroundImage: selectedBgImage ? `url(${selectedBgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
          >
            <style>{project.coverCustomCSS}</style>
            {selectedBgImage && showTextOnCover && <div className="absolute inset-0 bg-black/20" ></div>}

            {showTextOnCover && (
              <>
                {project.coverDesign?.showSeries && project.metadata.series && (
                  <div id="cover-series" className={`text-[10px] uppercase tracking-[0.3em] font-bold mb-3 z-10 ${currentTemplate.series} ${currentTemplate.font}`}>
                    {project.metadata.series}
                  </div>
                )}
                <h1 id="cover-title" className={`font-bold mb-6 break-words w-full z-10 ${currentTemplate.text} ${currentTemplate.font} leading-tight`} style={{ fontSize: `${project.coverDesign?.fontSizeTitle ?? 48}px` }}>
                  {project.metadata.title || "Book Title"}
                </h1>
                <div className={`w-16 h-1 mb-8 z-10 ${currentTemplate.text === 'text-white' ? 'bg-white/80' : 'bg-gray-800/80'}`}></div>
                <h2 id="cover-author" className={`text-xl z-10 ${currentTemplate.text} ${currentTemplate.font}`}>
                  {project.metadata.creator || "Author Name"}
                </h2>
              </>
            )}

            {!selectedBgImage && showTextOnCover && activeTemplate === 0 && <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full"></div>}
            {!selectedBgImage && showTextOnCover && activeTemplate === 1 && <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white/20 to-transparent"></div>}
          </div>
        </div>
        {project.cover && (<div className="flex items-center space-x-2 bg-white px-2.5 py-1 rounded-full border border-gray-200 dark:bg-gray-800 dark:border-gray-700"><span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span><span className="text-[11px] text-gray-500 dark:text-gray-400">当前已应用此封面</span></div>)}
      </div>
    </div>
  );
};

export default CoverGenerator;
