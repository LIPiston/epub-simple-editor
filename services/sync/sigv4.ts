/**
 * AWS Signature Version 4（header 形式）
 *
 * S3 兼容存储要求每个请求都带签名，否则一律 403。这里按 AWS 的官方步骤实现：
 *   1. 构造规范化请求（canonical request）
 *   2. 构造待签字符串（string to sign，含日期与凭据作用域）
 *   3. 逐级派生签名密钥（日期 → 区域 → 服务 → aws4_request）
 *   4. 用密钥对「待签字符串」做 HMAC-SHA256，得到签名
 *
 * 正确性是用 AWS 文档中「GET Object」示例的公开签名值校验过的
 * （scripts/test-sync-crypto.mjs 里钉住了这个向量）——签名算错的表现是
 * 干净的 403，几乎无法从报错里看出算错了哪一步，所以必须有测试。
 *
 * 实现细节上的两个坑：
 *   - S3 不做二次编码：路径里的 `/` 要保留为 `/`，不能编码成 %2F；
 *   - URI 编码必须按 RFC3986，`!'()*` 这几个字符 encodeURIComponent 不会转义，
 *     需要补上，否则含这些字符的 key 会签名不匹配。
 *
 * 依赖 WebCrypto（crypto.subtle）。它在 https 与 localhost 下可用；
 * 若部署在明文 http 的非本机地址下会缺失，此时给出可读的报错而不是静默失败。
 */

const encoder = new TextEncoder();

/** 空请求体的 SHA-256，S3 要求无正文时也带上这个值 */
export const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const toHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      '当前环境不支持 WebCrypto（crypto.subtle），无法为 S3 计算签名。' +
        '请通过 https 或 localhost 访问本应用。',
    );
  }
  return c.subtle;
};

/** UTF-8 字节的 SHA-256，返回十六进制 */
export const sha256Hex = async (data: string | ArrayBuffer | Uint8Array): Promise<string> => {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await subtle().digest('SHA-256', bytes as BufferSource);
  return toHex(new Uint8Array(digest));
};

/** HMAC-SHA256，返回原始字节（派生密钥时要继续当 key 用） */
const hmacBytes = async (key: Uint8Array | string, data: string): Promise<Uint8Array> => {
  const raw = typeof key === 'string' ? encoder.encode(key) : key;
  const imported = await subtle().importKey(
    'raw',
    raw as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle().sign('HMAC', imported, encoder.encode(data));
  return new Uint8Array(sig);
};

/** HMAC-SHA256，返回十六进制 */
const hmacHex = async (key: Uint8Array, data: string): Promise<string> => toHex(await hmacBytes(key, data));

/**
 * RFC3986 编码。
 * encodeURIComponent 漏掉 `!'()*`，而 AWS 要求它们被转义。
 */
const rfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * 规范化 URI 路径。
 * 逐段编码但保留分隔用的 `/`——S3 只做一次编码，把 `/` 编掉会导致签名对不上。
 */
const canonicalUri = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized
    .split('/')
    .map((segment) => rfc3986(segment))
    .join('/');
};

/** 规范化查询串：按 key 排序后逐项编码，空值也要带 `=` */
const canonicalQuery = (query?: Record<string, string | undefined>): string => {
  if (!query) return '';
  return Object.keys(query)
    .filter((k) => query[k] !== undefined)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(String(query[k]))}`)
    .join('&');
};

/** `YYYYMMDDTHHMMSSZ` 形式的 UTC 时间 */
export const formatAmzDate = (date: Date = new Date()): string =>
  date.toISOString().replace(/[:-]|\.\d{3}/g, '');

export interface SignParams {
  method: string;
  /** 绝对路径，如 /bucket/books/abc.json（路径风格）或 /books/abc.json（虚拟主机风格） */
  path: string;
  query?: Record<string, string | undefined>;
  /** 参与签名的请求头。至少要含 host 与 x-amz-date */
  headers: Record<string, string>;
  /** 请求体字节或字符串；GET/DELETE 传空 */
  body?: ArrayBuffer | Uint8Array | string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 临时凭据的 x-amz-security-token，已包含在 headers 里时可不传 */
  sessionToken?: string;
  /** 便于测试注入固定时间 */
  date?: Date;
  /**
   * 是否把请求体摘要作为 `x-amz-content-sha256` 头带上并参与签名。
   * S3 要求带（默认 true）；通用的 SigV4（非 S3 服务）不带，
   * 官方测试向量 get-vanilla 就是不带的那种，保留这个开关才能对齐它。
   */
  includePayloadHeader?: boolean;
}

/**
 * 给一组请求头补上签名所需的 `x-amz-date` / `x-amz-content-sha256` 与 `authorization`。
 * 返回新的 headers（不修改入参）。
 */
export const signRequest = async (params: SignParams): Promise<Record<string, string>> => {
  const service = params.service ?? 's3';
  const amzDate = formatAmzDate(params.date);
  const dateStamp = amzDate.slice(0, 8);

  // 请求体摘要：无正文时是空串的摘要
  const payloadHash = params.body === undefined || params.body === ''
    ? EMPTY_PAYLOAD_SHA256
    : await sha256Hex(params.body);

  // 统一小写（签名要求头名小写），并补上必须参与签名的两个头
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.headers)) headers[k.toLowerCase()] = String(v).trim();
  headers['x-amz-date'] = amzDate;
  if (params.includePayloadHeader !== false) headers['x-amz-content-sha256'] = payloadHash;
  if (params.sessionToken) headers['x-amz-security-token'] = params.sessionToken;

  // 只签我们自己设置的头（host 必签）。少签几个头不影响校验，
  // 但一旦把 Content-Type 之类也列进来，就必须与实际发送值逐字节一致，
  // 反而更容易出错，所以这里取最小集合。
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    params.method.toUpperCase(),
    canonicalUri(params.path),
    canonicalQuery(params.query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${params.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // 逐级派生：日期 → 区域 → 服务 → aws4_request
  const kDate = await hmacBytes(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = await hmacBytes(kDate, params.region);
  const kService = await hmacBytes(kRegion, service);
  const kSigning = await hmacBytes(kService, 'aws4_request');
  const signature = await hmacHex(kSigning, stringToSign);

  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
};
