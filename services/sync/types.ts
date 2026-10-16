/**
 * 云同步的类型定义
 *
 * 目标：把浏览器里的书库（localforage）备份到用户自己的 WebDAV 或 S3 存储，
 * 并能反过来恢复到本机。**只做手动同步**，不挂定时器、不在编辑时偷偷上传。
 *
 * 分层：
 *   types.ts        —— 配置与数据结构（本文件）
 *   sigv4.ts        —— S3 需要的 AWS Signature V4 签名
 *   providers/*     —— 「怎么跟一种存储说话」：WebDAV / S3
 *   plan.ts         —— 纯逻辑：本地与远端清单比对出「该做什么」
 *   engine.ts       —— 按计划真正读写两端
 *
 * 远端布局（两种 provider 一致，便于在它们之间互换）：
 *   <远端目录>/manifest.json      书目清单 + 每本的更新时间与内容摘要
 *   <远端目录>/books/<bookId>.json 单本书的完整 ProjectData
 *
 * 为什么是「每本一个文件 + 一份清单」，而不是打成一个压缩包：
 * 书稿里含 base64 图片，整库打包体积大；每本书独立成文件后，
 * 双向同步才能只动真正变化的那几本，而不是每次都全量重传。
 * 这也与本地存储「索引 + 逐本存储」的形状一致。
 */

import { ProjectData } from '../../types';

/** 支持的云存储类型 */
export type SyncProviderKind = 'webdav' | 's3';

/** WebDAV 连接配置 */
export interface WebDavConfig {
  /** 服务地址，如 https://dav.example.com/dav/ 或 http://192.168.1.2:5005 */
  baseUrl: string;
  /** 用户名（留空表示匿名访问） */
  username: string;
  /** 密码或应用专用密码 */
  password: string;
  /** 远端子目录，书稿会放在它下面（如 epub-simple-editor） */
  remoteDir: string;
}

/** S3 兼容存储配置（AWS S3 / MinIO / Cloudflare R2 / 阿里云 OSS 的 S3 接口等） */
export interface S3Config {
  /** 服务端点，如 https://s3.us-east-1.amazonaws.com 或 https://minio.example.com */
  endpoint: string;
  /** 区域，如 us-east-1 */
  region: string;
  /** 存储桶 */
  bucket: string;
  /** 桶内前缀（相当于目录），书稿会放在它下面 */
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 临时凭据用的会话令牌（长期 AccessKey 留空） */
  sessionToken: string;
  /**
   * 是否用「路径风格」访问（endpoint/bucket/key）。
   * MinIO 等自建服务通常需要；AWS S3 两种都支持。
   */
  forcePathStyle: boolean;
}

/** 一份完整的同步配置 */
export interface SyncConfig {
  provider: SyncProviderKind;
  webdav: WebDavConfig;
  s3: S3Config;
  /** 上次同步完成的时间戳，仅用于界面展示 */
  lastSyncedAt: number | null;
}

/** 远端清单里的一本书 */
export interface RemoteBookEntry {
  id: string;
  title: string;
  author: string;
  /** 书稿最后修改时间（来自本地书目索引） */
  updatedAt: number;
  sizeBytes: number;
  chapterCount: number;
  imageCount: number;
  /** 书稿内容的 SHA-256（十六进制），用于判断是否真的变了 */
  hash: string;
}

/** 远端清单：一次同步只需要读这一个文件，就知道云端有什么 */
export interface RemoteManifest {
  /** 清单格式版本，便于以后演进 */
  version: 1;
  /** 清单写入时间 */
  updatedAt: number;
  books: RemoteBookEntry[];
}

/** 从远端读到的对象 */
export interface RemoteFile {
  data: ArrayBuffer;
  /** 服务端返回的 ETag（可能没有） */
  etag?: string;
}

/**
 * 远端存储的最小接口。
 *
 * 只做「按 key 存取」，不提供 list：书目信息由我们自己的 manifest 维护，
 * 这样两种 provider 的行为完全一致，也省掉了对 S3 ListObjects XML 的解析。
 */
export interface RemoteStore {
  /** 用于界面展示与调试的存储地址描述 */
  readonly location: string;
  /** 连通性与写入权限自检；失败时抛出带可读信息的错误 */
  test(): Promise<void>;
  /** 读一个对象；不存在返回 null */
  get(key: string): Promise<RemoteFile | null>;
  /** 写一个对象（不存在则创建） */
  put(key: string, data: BlobPart, contentType?: string): Promise<void>;
  /** 删除一个对象（不存在也不报错） */
  remove(key: string): Promise<void>;
}

/** 一本书在某一侧（本地 / 远端）的摘要，用于比对 */
export interface BookDescriptor {
  id: string;
  title: string;
  author: string;
  updatedAt: number;
  sizeBytes: number;
  chapterCount: number;
  imageCount: number;
  hash: string;
}

/** 上次同步后的快照：记下每本书当时的内容摘要，用于三方比对 */
export interface SyncSnapshot {
  /** 这份快照属于哪个远端（换存储后旧快照不适用，需要清空） */
  providerKey: string;
  lastSyncedAt: number | null;
  /** bookId → 上次同步时的内容摘要 */
  books: Record<string, { hash: string }>;
}

/** 单本书在一次同步里的处置方式 */
export type SyncAction =
  /** 本地 → 远端 */
  | 'upload'
  /** 远端 → 本地 */
  | 'download'
  /** 两边都改过：本地留着，云端那份另存为副本 */
  | 'conflict'
  /**
   * 本机已删除（有同步记录可证），把云端清单条目也摘掉。
   * 注意只摘清单、不删云端数据文件：本机存储万一出问题，备份仍在。
   */
  | 'forget-remote'
  /** 两边一致，无需动作 */
  | 'in-sync';

/** 计划中的一条：对某本书做什么，以及为什么 */
export interface PlanItem {
  bookId: string;
  title: string;
  action: SyncAction;
  /** 便于界面解释「为什么这么处理」的短句 */
  reason: string;
}

/** 同步模式 */
export type SyncMode =
  /** 上传：本地覆盖远端（备份） */
  | 'upload'
  /** 下载：远端覆盖本地（恢复） */
  | 'download'
  /** 双向：按变化方向各自同步，冲突并存 */
  | 'two-way';

/** 一次同步的执行结果 */
export interface SyncOutcome {
  mode: SyncMode;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  skipped: number;
  /** 逐本书的处置明细，供界面展示 */
  items: PlanItem[];
  finishedAt: number;
}

/** 同步过程中的进度回调 */
export interface SyncProgress {
  /** 当前阶段的可读描述 */
  message: string;
  /** 已完成 / 总数（总数为 0 时表示不确定进度） */
  done: number;
  total: number;
}
