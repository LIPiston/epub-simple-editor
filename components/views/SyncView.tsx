/**
 * SyncView —— 云同步界面
 *
 * 把本机书库备份到用户自己的 WebDAV 或 S3 兼容存储，或从那边恢复回来。
 *
 * 三条贯穿界面的原则：
 *   1. **只手动**：所有传输都由这里的按钮触发，没有自动同步，也没有后台任务。
 *      界面顶部直接写明这一点，免得用户以为它会在编辑时偷偷上传。
 *   2. **先看再动**：执行前可以「预览差异」，看清打算上传/下载/判冲突哪些书。
 *   3. **不悄悄删东西**：措辞上明确「上传 = 用本地覆盖云端」「下载 = 用云端覆盖本地」，
 *      并把冲突的处理方式（云端另存为副本）写出来，不做用户预期之外的删除。
 */

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  DownloadCloud,
  Eye,
  Globe,
  HardDrive,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCloudSync } from '../../hooks/useCloudSync';
import { PlanItem, SyncConfig, SyncMode } from '../../services/sync/types';

const INPUT_CLASS =
  'h-8 w-full text-[13px] text-gray-900 bg-white border border-gray-200 rounded-md px-2 ' +
  'outline-none transition-colors focus:border-orange-500 focus:ring-1 focus:ring-orange-500 ' +
  'placeholder:text-gray-400 dark:text-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:placeholder:text-gray-500';

const LABEL_CLASS = 'w-24 shrink-0 text-xs text-gray-500 dark:text-gray-400';

const BTN_BASE =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const BTN_SECONDARY =
  `${BTN_BASE} border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-orange-600 ` +
  'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';

const BTN_PRIMARY =
  `${BTN_BASE} bg-orange-600 text-white font-semibold hover:bg-orange-700 ` +
  'dark:bg-gray-600 dark:hover:bg-gray-500';

/** 表单行 */
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="flex items-start gap-3 px-3 py-2">
    <label className={`${LABEL_CLASS} pt-1.5`}>{label}</label>
    <div className="min-w-0 flex-1">
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-orange-600"
    />
    {label}
  </label>
);

/** 相对时间 */
const formatTime = (timestamp: number | null): string => {
  if (!timestamp) return '尚未同步';
  const then = new Date(timestamp);
  return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(
    then.getDate(),
  ).padStart(2, '0')} ${then.toTimeString().slice(0, 5)}`;
};

// 配色遵循项目约定：只用灰阶、橙色与红色作为装饰色。
// 「下载」用橙色的浅色调区分于「上传」的实心橙，而不是引入蓝色系。
const ACTION_STYLE: Record<PlanItem['action'], { label: string; className: string }> = {
  upload: { label: '上传', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  download: { label: '下载', className: 'bg-orange-50 text-orange-600 dark:bg-gray-800 dark:text-orange-300' },
  conflict: { label: '冲突', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  'forget-remote': {
    label: '移除记录',
    className: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  'in-sync': { label: '一致', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const SyncView: React.FC = () => {
  const {
    config,
    updateConfig,
    persistConfig,
    isDirty,
    busy,
    progress,
    outcome,
    previewItems,
    error,
    statusMessage,
    testConnection,
    preview,
    sync,
    resetBaseline,
    dismissError,
  } = useCloudSync();

  const isBusy = busy !== null;
  /** 「正在同步」时按钮要显示得和「正在校验」不同 */
  const syncingMode = busy === 'upload' || busy === 'download' || busy === 'two-way' ? busy : null;

  const setWebdav = (key: keyof SyncConfig['webdav'], value: string) =>
    updateConfig((prev) => ({ ...prev, webdav: { ...prev.webdav, [key]: value } }));

  const setS3 = <K extends keyof SyncConfig['s3']>(key: K, value: SyncConfig['s3'][K]) =>
    updateConfig((prev) => ({ ...prev, s3: { ...prev.s3, [key]: value } }));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* 工具栏 */}
      <div className="flex-none border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          <Cloud size={15} className="text-orange-600 dark:text-gray-400" />
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">云同步</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            上次同步：{formatTime(config.lastSyncedAt)}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="text-[11px] text-orange-600 dark:text-orange-400">设置未保存</span>
            )}
            <button
              type="button"
              onClick={persistConfig}
              disabled={!isDirty}
              className={BTN_SECONDARY}
              title="把当前设置保存到本机浏览器"
            >
              <Save size={13} />
              保存设置
            </button>
            <button
              type="button"
              onClick={testConnection}
              disabled={isBusy}
              className={BTN_SECONDARY}
              data-sync-test="true"
              title="校验地址、凭据与读写权限"
            >
              {busy === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
              {busy === 'testing' ? '检测中…' : '测试连接'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {/* 只手动同步的说明 */}
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            云同步<strong className="font-semibold">完全手动</strong>：只有点击下面的按钮才会传输数据。
            编辑与自动保存仍只写在本机，不会在后台自动上传。
          </div>

          {/* 反馈区 */}
          {error && (
            <div
              data-sync-error="true"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950"
            >
              <AlertTriangle size={14} className="mt-0.5 flex-none text-red-600 dark:text-red-400" />
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-relaxed text-red-700 dark:text-red-300">
                {error}
              </p>
              <button
                type="button"
                onClick={dismissError}
                className="flex-none text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-300"
              >
                关闭
              </button>
            </div>
          )}

          {statusMessage && !error && (
            <div
              data-sync-status="true"
              className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <CheckCircle2 size={14} className="mt-0.5 flex-none text-orange-600 dark:text-orange-400" />
              <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{statusMessage}</p>
            </div>
          )}

          {progress && isBusy && (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-[12px] text-gray-600 dark:text-gray-300">{progress.message}</p>
              {progress.total > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-orange-600 transition-all dark:bg-gray-500"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 存储选择 */}
          <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <HardDrive size={14} className="text-gray-400 dark:text-gray-500" />
              <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">存储方式</h2>
            </header>

            <div className="flex gap-2 px-3 py-2">
              {([
                { id: 'webdav' as const, label: 'WebDAV', icon: Globe, hint: '坚果云 / Nextcloud / 群晖' },
                { id: 's3' as const, label: 'S3 兼容存储', icon: Database, hint: 'AWS S3 / MinIO / R2' },
              ]).map((option) => {
                const Icon = option.icon;
                const active = config.provider === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-sync-provider={option.id}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => updateConfig((prev) => ({ ...prev, provider: option.id }))}
                    className={`flex flex-1 items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-orange-500 bg-orange-50 dark:border-gray-500 dark:bg-gray-800'
                        : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon
                      size={15}
                      className={`mt-0.5 flex-none ${active ? 'text-orange-600 dark:text-gray-300' : 'text-gray-400'}`}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-[13px] font-semibold ${
                          active ? 'text-orange-700 dark:text-gray-200' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-gray-400 dark:text-gray-500">
                        {option.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 连接设置 */}
          <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <PlugZap size={14} className="text-gray-400 dark:text-gray-500" />
              <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">连接设置</h2>
            </header>

            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {config.provider === 'webdav' ? (
                <>
                  <Field label="服务地址" hint="含协议与路径，例如 https://dav.jianguoyun.com/dav/">
                    <input
                      type="text"
                      data-sync-field="webdav-baseUrl"
                      className={INPUT_CLASS}
                      placeholder="https://dav.example.com/dav/"
                      value={config.webdav.baseUrl}
                      onChange={(e) => setWebdav('baseUrl', e.target.value)}
                    />
                  </Field>
                  <Field label="用户名">
                    <input
                      type="text"
                      data-sync-field="webdav-username"
                      className={INPUT_CLASS}
                      placeholder="登录用户名"
                      value={config.webdav.username}
                      onChange={(e) => setWebdav('username', e.target.value)}
                    />
                  </Field>
                  <Field label="密码" hint="坚果云等服务需使用「应用密码」，而不是账号登录密码。">
                    <input
                      type="password"
                      data-sync-field="webdav-password"
                      className={INPUT_CLASS}
                      placeholder="应用专用密码"
                      value={config.webdav.password}
                      onChange={(e) => setWebdav('password', e.target.value)}
                    />
                  </Field>
                  <Field label="远端目录" hint="书稿会存放在该目录下；不存在时会自动创建。">
                    <input
                      type="text"
                      data-sync-field="webdav-remoteDir"
                      className={INPUT_CLASS}
                      placeholder="epub-simple-editor"
                      value={config.webdav.remoteDir}
                      onChange={(e) => setWebdav('remoteDir', e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="服务端点" hint="AWS 为 https://s3.<区域>.amazonaws.com；自建服务填其地址。">
                    <input
                      type="text"
                      data-sync-field="s3-endpoint"
                      className={INPUT_CLASS}
                      placeholder="https://s3.us-east-1.amazonaws.com"
                      value={config.s3.endpoint}
                      onChange={(e) => setS3('endpoint', e.target.value)}
                    />
                  </Field>
                  <Field label="区域" hint="必须与该桶实际所在区域一致，否则会返回 301/签名错误。">
                    <input
                      type="text"
                      data-sync-field="s3-region"
                      className={INPUT_CLASS}
                      placeholder="us-east-1"
                      value={config.s3.region}
                      onChange={(e) => setS3('region', e.target.value)}
                    />
                  </Field>
                  <Field label="存储桶">
                    <input
                      type="text"
                      data-sync-field="s3-bucket"
                      className={INPUT_CLASS}
                      placeholder="my-books"
                      value={config.s3.bucket}
                      onChange={(e) => setS3('bucket', e.target.value)}
                    />
                  </Field>
                  <Field label="路径前缀" hint="相当于桶内的目录，可留空。">
                    <input
                      type="text"
                      data-sync-field="s3-prefix"
                      className={INPUT_CLASS}
                      placeholder="epub-simple-editor"
                      value={config.s3.prefix}
                      onChange={(e) => setS3('prefix', e.target.value)}
                    />
                  </Field>
                  <Field label="Access Key">
                    <input
                      type="text"
                      data-sync-field="s3-accessKeyId"
                      className={INPUT_CLASS}
                      placeholder="AKIA…"
                      value={config.s3.accessKeyId}
                      onChange={(e) => setS3('accessKeyId', e.target.value)}
                    />
                  </Field>
                  <Field label="Secret Key">
                    <input
                      type="password"
                      data-sync-field="s3-secretAccessKey"
                      className={INPUT_CLASS}
                      placeholder="Secret Access Key"
                      value={config.s3.secretAccessKey}
                      onChange={(e) => setS3('secretAccessKey', e.target.value)}
                    />
                  </Field>
                  <Field label="会话令牌" hint="仅使用临时凭据（STS）时需要，长期密钥留空。">
                    <input
                      type="password"
                      data-sync-field="s3-sessionToken"
                      className={INPUT_CLASS}
                      placeholder="可留空"
                      value={config.s3.sessionToken}
                      onChange={(e) => setS3('sessionToken', e.target.value)}
                    />
                  </Field>
                  <Field label="路径风格" hint="MinIO 等自建服务通常需要勾选；AWS S3 可不勾。">
                    <Toggle
                      checked={config.s3.forcePathStyle}
                      onChange={(v) => setS3('forcePathStyle', v)}
                      label="使用路径风格访问（endpoint/bucket/key）"
                    />
                  </Field>
                </>
              )}
            </div>

            <p className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
              凭据保存在本机浏览器中（localStorage）。本应用没有服务端可以代为保管，
              建议使用<strong className="font-medium">仅授予该目录/桶权限</strong>的专用凭据。
            </p>
          </section>

          {/* 同步操作 */}
          <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <RefreshCw size={14} className="text-gray-400 dark:text-gray-500" />
              <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">同步操作</h2>
              <button
                type="button"
                onClick={() => preview('two-way')}
                disabled={isBusy}
                className={`ml-auto ${BTN_SECONDARY}`}
                data-sync-preview="true"
                title="比对两端差异，不传输任何数据"
              >
                {busy === 'previewing' ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                {busy === 'previewing' ? '比对中…' : '预览差异'}
              </button>
            </header>

            <div className="flex flex-wrap gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => sync('upload')}
                disabled={isBusy}
                className={BTN_PRIMARY}
                data-sync-run="upload"
                title="把本机书库备份到云端（用本地内容覆盖云端同名书）"
              >
                {syncingMode === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                备份到云端
              </button>
              <button
                type="button"
                onClick={() => sync('download')}
                disabled={isBusy}
                className={BTN_SECONDARY}
                data-sync-run="download"
                title="从云端恢复到本机（用云端内容覆盖本机同名书）"
              >
                {syncingMode === 'download' ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                从云端恢复
              </button>
              <button
                type="button"
                onClick={() => sync('two-way')}
                disabled={isBusy}
                className={BTN_SECONDARY}
                data-sync-run="two-way"
                title="按改动方向分别同步；两端都改过则保留本地并另存云端副本"
              >
                {syncingMode === 'two-way' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                双向同步
              </button>
              <button
                type="button"
                onClick={resetBaseline}
                disabled={isBusy}
                className={`ml-auto ${BTN_SECONDARY}`}
                data-sync-reset="true"
                title="清除本机记录的同步基线"
              >
                <Trash2 size={13} />
                清除基线
              </button>
            </div>

            <p className="border-t border-gray-200 px-3 py-2 text-[11px] leading-relaxed text-gray-400 dark:border-gray-800 dark:text-gray-500">
              「备份到云端」与「从云端恢复」都是<strong className="font-medium">覆盖</strong>语义，
              不会删除另一端独有的书。双向同步在两端都改动过时会保留本机版本，
              把云端那份另存为一本「云端副本」，并用本机版本更新云端，不会丢弃任何一方。
              在本机删掉的书，同步时会从云端清单里移除它的记录，但
              <strong className="font-medium">云端数据文件仍会保留</strong>，以备本机存储出问题时找回。
            </p>
          </section>

          {/* 差异与结果 */}
          {previewItems && (
            <section
              data-sync-plan="true"
              className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
            >
              <header className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
                  差异预览（{previewItems.filter((i) => i.action !== 'in-sync').length} 本需要处理）
                </h2>
              </header>
              <PlanList items={previewItems} />
            </section>
          )}

          {outcome && (
            <section
              data-sync-outcome="true"
              className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
            >
              <header className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                <h2 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
                  上次同步结果
                </h2>
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                  上传 {outcome.uploaded} 本 · 下载 {outcome.downloaded} 本 · 冲突 {outcome.conflicts} 本 ·
                  无需处理 {outcome.skipped} 本 · 于 {formatTime(outcome.finishedAt)}
                </p>
              </header>
              <PlanList items={outcome.items} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

/** 计划 / 结果明细列表 */
const PlanList: React.FC<{ items: PlanItem[] }> = ({ items }) => (
  <div className="divide-y divide-gray-200 dark:divide-gray-800">
    {items.map((item) => {
      const style = ACTION_STYLE[item.action];
      return (
        <div key={item.bookId} data-sync-item={item.action} className="flex items-center gap-2 px-3 py-1.5">
          <span className={`flex-none rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${style.className}`}>
            {style.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-gray-800 dark:text-gray-200" title={item.title}>
            {item.title}
          </span>
          <span className="flex-none text-[11px] text-gray-400 dark:text-gray-500">{item.reason}</span>
        </div>
      );
    })}
  </div>
);

export default SyncView;
