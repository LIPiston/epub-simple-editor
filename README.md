# 📚 EPUB Simple Editor (EPUB 制作工具)

<div align="center">

![GitHub Stars](https://img.shields.io/github/stars/LIPiston/epub-simple-editor?style=flat-square)
![GitHub Forks](https://img.shields.io/github/forks/LIPiston/epub-simple-editor?style=flat-square)
![GitHub License](https://img.shields.io/github/license/LIPiston/epub-simple-editor?style=flat-square)
![Deployment Status](https://img.shields.io/github/deployments/LIPiston/epub-simple-editor/github-pages?label=deploy&style=flat-square)

一个在线 EPUB 电子书制作应用，使用 React 18 和 TypeScript 构建。轻松创建、编辑和导出专业级的 EPUB 3 格式电子书。

[立即体验](https://lipiston.github.io/epub-simple-editor/) | [报告 Bug](https://github.com/LIPiston/epub-simple-editor/issues) | [提交建议](https://github.com/LIPiston/epub-simple-editor/issues)

</div>

---

## ✨ 主要功能

### 📖 书库与章节管理
- **多书并行**：书库里的每本书独立保存，切换书时无需来回导入导出；支持新建、复制、重命名、删除。
- **可视化编辑**：使用功能齐全的富文本编辑器编写内容。
- **灵活结构**：支持多级章节嵌套，自动生成符合标准的目录（NCX/Nav）。
- **拖拽排序**：通过直观的界面轻松调整书籍结构。

### 🎨 封面设计
- **深度自定义**：内置设计工具，支持调整文字布局、字体、渐变背景及特效。
- **实时预览**：所见即所得，确保导出效果完美。

### 📝 完善的元数据
- 支持标准 EPUB 元数据，包括标题、作者、出版社、语言、描述及标签，提升书籍在阅读器中的识别度。

### 🖼️ 资源管理
- **媒体库**：集中管理图片资源（JPG, PNG, WebP, SVG），并统计每张图被哪些章节引用。
- **文件管理**：以资源管理器视图查看导出的 EPUB 内部结构，支持上传字体、CSS 或其他辅助文件。

### 🧭 两级导航
- 侧边栏参考 VS Code：左侧是只放图标的一级活动栏（书库 / 内容 / 设计 / 发布），
  右侧是可整体收起的二级面板。点击已激活的一级分组即可收起/展开面板，收起状态会被记住。

### ☁️ 云同步（WebDAV / S3）
- **只手动同步**：所有上传下载都由「云同步」界面里的按钮触发，不会在编辑时自动上传，
  也不在后台跑任何定时任务。编辑与自动保存仍然只写在本机。
- **两种存储**：WebDAV（坚果云 / Nextcloud / 群晖等）与 S3 兼容存储
  （AWS S3 / MinIO / Cloudflare R2 / 阿里云 OSS 的 S3 接口等）。S3 走标准的
  SigV4 签名，除长期密钥外也支持临时凭据的会话令牌，以及自建服务的路径风格访问。
- **三种模式**：备份到云端、从云端恢复、双向同步。前两者是覆盖语义，
  且都不会删除另一端独有的书。
- **先看再动**：可先「预览差异」，看清打算上传 / 下载 / 判冲突哪些书，再决定是否执行。
- **冲突不丢数据**：双向同步下若两端都改过同一本书，保留本机版本，
  把云端那份另存为一本「云端副本」，并用本机版本更新云端，两端收敛到同一状态。
- **不误删云端备份**：在本机删掉的书，同步时只从云端清单移除它的记录，
  云端的数据文件仍然保留，以备本机存储出问题时还能找回。

> 凭据（密码 / Access Key）保存在本机浏览器的 `localStorage` 里。本应用没有服务端可以代为保管，
> 建议使用仅授予该目录 / 桶权限的专用凭据，把风险限制在可接受范围。

### 📱 移动端（< 768px）
- 操作逻辑参考 Obsidian 手机端：顶栏左边是导航入口、右边是大纲入口，正文居中占满整屏。
- **左抽屉**：两级导航整体滑入；**右抽屉**从中间分成上下两半 ——
  上半是当前章节的小标题大纲（点条目前往对应小节），下半是全书目录
  （点一行即可换章，打开时自动把当前章滚进视野）。两个抽屉互斥，同时只会开一个。
- **边缘滑动**：从左边缘右滑开导航，从右边缘左滑开大纲，朝关闭方向滑即收起。
  只在贴着边缘起手、且横向位移压过纵向时才认账，不会和正文滚动、选字抢手势。
- 目录管理 / 文件管理在窄屏改为「列表 → 内容」两屏切换（点返回箭头回列表），
  避免列表和内容硬挤在一屏里。
- 触摸设备没有悬停，目录行、文件树、图片上原本「悬停才出现」的操作按钮改为常显，
  否则在手机上永远点不到。
- 视口高度用 `dvh`（地址栏收放时底栏不会被顶出屏幕），并适配刘海屏安全区。

### 🌗 深色 / 浅色主题
- 活动栏左下角（「导出」上方）有一键切换开关，单击即可在深浅之间切换。
- 首次进入跟随系统偏好；用户手动切过一次之后，改为跟随用户的选择，不再被系统改动覆盖，
  选择记录在 `localStorage`（`epub-simple-editor-theme`），刷新后依然生效。
- 悬浮提示为自绘层（跟随主题配色），替代系统绘制的原生 `title` 提示 —— 后者在深色模式下
  会渲染成看不清的纯黑框。

---

## 🚀 技术栈

- **核心框架**: [React 18](https://react.dev/)
- **开发语言**: [TypeScript](https://www.typescriptlang.org/)
- **构建工具**: [Vite 6](https://vitejs.dev/)
- **核心组件**:
  - **TipTap**: 富文本编辑器。
  - **JSZip**: 处理 EPUB 容器生成。
  - **Lucide React**: 图标库。
  - **localforage**: 书库与书稿的本地持久化。

---

## 🛠️ 快速开始

### 开发环境搭建

1. **克隆项目**
   ```bash
   git clone https://github.com/LIPiston/epub-simple-editor.git
   cd epub-simple-editor
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **运行**
   ```bash
   npm run dev
   ```

### 测试

浏览器回归测试基于 `playwright-core`（使用本机已安装的 Chromium/Chrome/Edge；
找不到浏览器时会跳过而不是误报失败）：

```bash
npm run test:library    # 书库：多书隔离、复制/重命名/删除、旧数据迁移
npm run test:nav        # 两级可收回导航（活动栏 + 侧边面板）
npm run test:theme      # 主题开关位置、跟随系统/记住用户选择、悬浮提示层
npm run test:mobile     # 手机端：左右抽屉、右抽屉上下分区、边缘滑动手势、触摸端操作常显
npm run test:toolbar    # 窄屏工具栏：「更多工具」可达、6 种分割线样式可选可插入
npm run test:toc-toggle # 目录行的「是否加入目录」开关
npm run test:pill       # 自动保存胶囊不遮挡编辑器底栏
npm run test:reading    # 记住上次阅读位置
npm run test:editor     # 点击页边距时的光标定位
npm run test:roundtrip  # 导出产物可被重新导入
npm run test:sync       # 云同步：WebDAV/S3 全流程、双向冲突、不误删、仅手动（起真实本地服务端）
npm run test:sync-crypto # 云同步纯逻辑：SigV4 签名对齐 AWS 官方向量、同步计划判定（无需浏览器）
```

`test:sync` 会起一个真实的本地 HTTP 服务模拟 WebDAV 与 S3。其中 S3 那一侧会
**在服务端独立重算 SigV4 并校验签名**，不匹配即返回 403 —— 这是浏览器端 WebCrypto
签名正确性的端到端证据，而不只是「请求发出去了」。

---

## 🙏 来源说明

本项目基于 [kukurii/epub-maker](https://github.com/kukurii/epub-maker) 修改而来，
原作者为 [kukurii](https://github.com/kukurii)。在原项目基础上做了以下方向的调整：

- 书库与多书管理（按书隔离存储、复制/重命名/删除）
- VS Code 式两级可收回导航，以及移动端左右抽屉与边缘滑动手势
- 深色 / 浅色主题与自绘悬浮提示
- 云同步（WebDAV / S3 兼容存储，仅手动触发）
- 编辑器光标定位与 EPUB 导入转义的若干修复

原项目的 MIT 授权与署名一并保留，详见 [LICENSE](LICENSE)。

---

## 🤝 贡献与反馈

欢迎任何形式的贡献！无论是代码提交、功能建议还是文档改进。

1. Fork 本仓库
2. 创建分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源，采用双署名：

- Copyright (c) 2026 kukurii（epub-maker 原作者）
- Copyright (c) 2026 LIPiston（本项目修改）

---

<div align="center">
Made with ❤️ by LIPiston，基于 <a href="https://github.com/kukurii/epub-maker">kukurii/epub-maker</a>
</div>
