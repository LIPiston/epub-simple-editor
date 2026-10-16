/**
 * S3 兼容存储
 *
 * 目标是「任何讲 S3 协议的存储都能用」：AWS S3、MinIO、Cloudflare R2、
 * 阿里云 OSS 的 S3 兼容接口、Backblaze B2 等，差别主要在端点地址与
 * 是否需要路径风格访问，都交给配置项处理。
 *
 * 与 WebDAV 的实现差别：
 *   - 每个请求都要带 SigV4 签名头（见 ../sigv4.ts）；
 *   - 认证失败通常是 403，而 S3 的 403 原因很多（签名错、权限不足、
 *     桶名不对），所以报错里把服务端返回的 Code/Message 一并带出来；
 *   - 浏览器直连 S3 必须给桶配 CORS，否则连 PUT 都发不出去。
 */

import { signRequest } from '../sigv4';
import { RemoteFile, RemoteStore, S3Config } from '../types';

interface ResolvedEndpoint {
  /** 请求用的基地址，已含桶 */
  origin: string;
  /** 桶在路径里占的前缀（路径风格时有值） */
  bucketPath: string;
}

/**
 * 决定用虚拟主机风格还是路径风格，并拼出含桶的基地址。
 *
 * 虚拟主机风格：https://bucket.s3.us-east-1.amazonaws.com
 * 路径风格：    https://minio.example.com/bucket
 */
export const resolveEndpoint = (config: S3Config): ResolvedEndpoint => {
  const raw = (config.endpoint || '').trim();
  const bucket = (config.bucket || '').trim();

  if (!raw) throw new Error('请填写 S3 服务端点。');
  if (!bucket) throw new Error('请填写存储桶名称。');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('S3 服务端点不是合法的 URL，请包含 http:// 或 https://。');
  }

  const basePath = url.pathname.replace(/\/+$/, '');

  if (config.forcePathStyle) {
    return {
      origin: `${url.origin}${basePath}/${encodeURIComponent(bucket)}`,
      bucketPath: '',
    };
  }

  // 虚拟主机风格：把桶拼到域名最前面。
  // 若用户填的端点本身已含桶（如 https://mybucket.s3.amazonaws.com），就不再重复拼。
  const host = url.host.startsWith(`${bucket}.`) ? url.host : `${bucket}.${url.host}`;
  return { origin: `${url.protocol}//${host}${basePath}`, bucketPath: '' };
};

/** 前缀（相当于目录）规范化：去掉首尾斜杠 */
const normalizePrefix = (prefix: string): string =>
  (prefix || '').trim().replace(/^\/+|\/+$/g, '');

/** 拼出对象 key 的完整 URL；key 里的 `/` 逐段编码 */
const objectUrl = (endpoint: ResolvedEndpoint, prefix: string, key: string): string => {
  const path = [prefix, key].filter(Boolean).join('/');
  return `${endpoint.origin}/${path.split('/').map(encodeURIComponent).join('/')}`;
};

/** 从 S3 的 XML 错误响应里抠出 Code / Message，让报错说得上人话 */
const parseS3Error = (body: string): { code?: string; message?: string } => {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
  return { code, message };
};

const describeFailure = async (action: string, response: Response): Promise<Error> => {
  let body = '';
  try {
    body = await response.text();
  } catch {
    // 读不出正文也无妨
  }
  const { code, message } = parseS3Error(body);

  if (response.status === 403) {
    const hint =
      code === 'SignatureDoesNotMatch'
        ? '签名不匹配：请核对 Secret Access Key、区域（region）是否与该桶一致。'
        : code === 'AccessDenied'
          ? '权限不足：请确认该密钥对目标桶有读写权限。'
          : '请检查密钥、区域与桶名是否正确。';
    return new Error(
      `${action}失败：403 Forbidden${code ? `（${code}）` : ''}。${hint}` +
        `${message ? ` 服务端说明：${message}` : ''}`,
    );
  }
  if (response.status === 301 || response.status === 307) {
    return new Error(
      `${action}失败：${response.status}，桶位于其他区域。` +
        '请把「区域」改成该桶实际所在的区域（如 us-west-2、ap-northeast-1）。',
    );
  }
  if (response.status === 404) {
    return new Error(`${action}失败：404，桶或对象不存在。请检查桶名、端点与区域。`);
  }

  return new Error(
    `${action}失败：HTTP ${response.status} ${response.statusText}` +
      `${code ? `（${code}）` : ''}${message ? ` —— ${message}` : ''}`,
  );
};

export const createS3Store = (config: S3Config): RemoteStore => {
  const endpoint = resolveEndpoint(config);
  const prefix = normalizePrefix(config.prefix);
  const region = (config.region || 'us-east-1').trim();
  const sessionToken = (config.sessionToken || '').trim() || undefined;

  /**
   * 发一个已签名的请求。
   * host 必须参与签名，而浏览器会自动带上正确的 Host，所以这里只算不设。
   */
  const send = async (
    method: string,
    url: string,
    options: { body?: string; contentType?: string; action: string },
  ): Promise<Response> => {
    const parsed = new URL(url);
    const headers: Record<string, string> = { host: parsed.host };

    // 查询串必须作为 canonical query 参与签名，不能拼进 path ——
    // 拼进 path 会让签名与 S3 服务端的算法不一致而 403。
    // 当前所有请求都不带查询参数，这里只是保证语义正确。
    const query: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const signed = await signRequest({
      method,
      path: parsed.pathname,
      query,
      headers,
      body: options.body,
      region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken,
    });

    const requestHeaders: Record<string, string> = {
      // 签名算出的头（含 authorization / x-amz-date / x-amz-content-sha256）
      ...signed,
    };
    delete requestHeaders.host; // 由浏览器决定，手动设置会被忽略甚至报错
    if (options.contentType) requestHeaders['Content-Type'] = options.contentType;

    try {
      return await fetch(url, { method, headers: requestHeaders, body: options.body });
    } catch (e) {
      throw new Error(
        `${options.action}失败：请求无法发出。对象存储需要为桶配置 CORS ` +
          `（允许来源、PUT/GET/DELETE 方法与 ETag 等响应头），否则浏览器会直接拦下请求。` +
          `原始错误：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return {
    location: `${endpoint.origin}/${prefix}`,

    async test() {
      // 写一个探测对象再删掉：同时验证端点、签名与读写权限，
      // 比只做 HEAD 更贴近真实使用（备份必须能写）。
      const probeUrl = objectUrl(endpoint, prefix, '.epub-simple-editor-probe');
      const body = 'ok';

      const response = await send('PUT', probeUrl, {
        body,
        contentType: 'text/plain',
        action: '连接测试',
      });
      if (!response.ok) throw await describeFailure('连接测试', response);

      const cleanup = await send('DELETE', probeUrl, { action: '连接测试（清理）' });
      // 探测对象没删掉不影响使用，只是留个垃圾文件，提示但不失败
      if (!cleanup.ok && cleanup.status !== 404) {
        console.warn('S3 连接测试：探测对象未能删除', cleanup.status);
      }
    },

    async get(key: string): Promise<RemoteFile | null> {
      const url = objectUrl(endpoint, prefix, key);
      const response = await send('GET', url, { action: '读取云端文件' });
      if (response.status === 404) return null;
      if (!response.ok) throw await describeFailure('读取云端文件', response);

      return {
        data: await response.arrayBuffer(),
        etag: response.headers.get('ETag') ?? undefined,
      };
    },

    async put(key: string, data: BlobPart, contentType = 'application/json'): Promise<void> {
      const url = objectUrl(endpoint, prefix, key);
      const body = typeof data === 'string' ? data : await new Blob([data as BlobPart]).text();
      const response = await send('PUT', url, { body, contentType, action: '写入云端文件' });
      if (!response.ok) throw await describeFailure('写入云端文件', response);
    },

    async remove(key: string): Promise<void> {
      const url = objectUrl(endpoint, prefix, key);
      const response = await send('DELETE', url, { action: '删除云端文件' });
      if (!response.ok && response.status !== 404) {
        throw await describeFailure('删除云端文件', response);
      }
    },
  };
};
