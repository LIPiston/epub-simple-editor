/**
 * WebDAV 远端存储
 *
 * 用最普通的一套 HTTP 方法：GET 读、PUT 写、DELETE 删、MKCOL 建目录。
 * 覆盖 Nextcloud、坚果云、群晖、Apache mod_dav 等绝大多数实现。
 *
 * 几个现实中的坑：
 *   - 跨域：浏览器直连 WebDAV 需要服务端允许 CORS，否则会被浏览器拦掉，
 *     表现是「网络错误」而非 4xx。报错信息里明确点出这一点，省得用户白找。
 *   - 认证：Basic。部分服务要求改用「应用密码」而不是账号主密码（坚果云就是）。
 *   - 目录不存在：PUT 到多层子目录不会自动建，需要逐级 MKCOL。
 */

import { RemoteFile, RemoteStore, WebDavConfig } from '../types';

interface DavPaths {
  origin: string;
  /** 含远端目录的完整路径，如 /dav/epub-simple-editor */
  rootPath: string;
  /** 完整根目录 URL，以 / 结尾 */
  root: string;
}

/**
 * 解出远端根目录的路径。
 *
 * baseUrl 自带的路径与 remoteDir 要分开保留：`remoteDir` 可能写成多级
 * （如 `books/epub`），创建目录时它的中间层级同样需要先建出来，
 * 否则真实 WebDAV 会因「上级集合不存在」返回 409。
 */
const resolvePaths = (config: WebDavConfig): DavPaths => {
  const base = (config.baseUrl || '').trim();
  if (!base) throw new Error('请填写 WebDAV 服务地址。');

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('WebDAV 服务地址不是合法的 URL，请包含 http:// 或 https://。');
  }

  const basePath = url.pathname.replace(/\/+$/, '');
  const dir = (config.remoteDir || '').trim().replace(/^\/+|\/+$/g, '');
  const dirPath = dir ? `/${dir.split('/').map(encodeURIComponent).join('/')}` : '';
  const rootPath = `${basePath}${dirPath}`;

  return { origin: url.origin, rootPath, root: `${url.origin}${rootPath}/` };
};

/** 拼出某个 key 的完整 URL；key 里允许出现 `/`，逐段编码 */
const resolveKey = (root: string, key: string): string =>
  root + key.split('/').map(encodeURIComponent).join('/');

const authHeader = (config: WebDavConfig): Record<string, string> => {
  if (!config.username) return {};
  // 用户名或密码含非 ASCII（如中文用户名）时，btoa 会抛错，先按 UTF-8 转字节
  const raw = `${config.username}:${config.password}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return { Authorization: `Basic ${btoa(binary)}` };
};

/** 把 HTTP 响应转成可读的错误信息 */
const describeFailure = async (action: string, response: Response): Promise<Error> => {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 200).replace(/\s+/g, ' ').trim();
  } catch {
    // 读不出正文也无妨
  }

  if (response.status === 401 || response.status === 403) {
    return new Error(
      `${action}失败：认证被拒绝（${response.status}）。` +
        '请检查用户名与密码；部分服务（如坚果云）需要使用「应用密码」而非登录密码。',
    );
  }
  if (response.status === 404) {
    return new Error(`${action}失败：路径不存在（404）。请检查服务地址与远端目录是否正确。`);
  }
  if (response.status === 409) {
    return new Error(`${action}失败：上级目录不存在（409）。`);
  }

  return new Error(`${action}失败：HTTP ${response.status} ${response.statusText}${detail ? ` —— ${detail}` : ''}`);
};

/** 一次 fetch 包装：把网络层异常（多半是 CORS）换成能看懂的说明 */
const request = async (url: string, init: RequestInit, action: string): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(
      `${action}失败：请求无法发出。常见原因是服务端未允许跨域（CORS），` +
        `或地址不可达。原始错误：${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const createWebDavStore = (config: WebDavConfig): RemoteStore => {
  const paths = resolvePaths(config);
  const root = paths.root;
  const headers = authHeader(config);

  /**
   * 从 origin 起逐级创建到目标目录，已存在（405）视为成功。
   *
   * 必须逐级建：真实 WebDAV（Nextcloud / nginx dav / Apache mod_dav）在父集合
   * 不存在时对 MKCOL 返回 409，不会替调用方补中间层级。而 baseUrl 与
   * remoteDir 合起来可能是多级路径（如 /dav/books/epub），每一级都要确保存在。
   *
   * @param absolutePath 相对 origin 的完整路径，已含 baseUrl 自带的层级
   *                     （如 /dav/books/epub）
   *
   * 已建过的目录记在 ensured 里，避免同一个会话内对每个文件重复 MKCOL。
   */
  const ensured = new Set<string>();
  const ensureDirectory = async (absolutePath: string): Promise<void> => {
    const segments = absolutePath.split('/').filter(Boolean);

    let current = '';
    for (const segment of segments) {
      current += `/${encodeURIComponent(segment)}`;
      if (ensured.has(current)) continue;

      const response = await request(`${paths.origin}${current}/`, { method: 'MKCOL', headers }, '创建目录');
      // 201 新建成功；405 已存在。其余（含 401/403/409）都当成问题报出来
      if (response.status !== 201 && response.status !== 405) {
        throw await describeFailure('创建目录', response);
      }
      ensured.add(current);
    }
  };

  return {
    location: root,

    async test() {
      // 建到根目录为止：既能验证地址可达、凭据有效，也能验证有写权限，
      // 而不动任何已有数据。
      await ensureDirectory(paths.rootPath);
    },

    async get(key: string): Promise<RemoteFile | null> {
      const url = resolveKey(root, key);
      const response = await request(url, { method: 'GET', headers }, '读取云端文件');
      if (response.status === 404) return null;
      if (!response.ok) throw await describeFailure('读取云端文件', response);

      return {
        data: await response.arrayBuffer(),
        etag: response.headers.get('ETag') ?? undefined,
      };
    },

    async put(key: string, data: BlobPart, contentType = 'application/json'): Promise<void> {
      const url = resolveKey(root, key);
      // 按需建出 key 所在目录（含 remoteDir 的中间层级与最外层根目录）。
      // 不依赖用户先点过「测试连接」——直接点「备份到云端」也必须能成功。
      const keyDir = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
      await ensureDirectory(keyDir ? `${paths.rootPath}/${keyDir}` : paths.rootPath);
      const response = await request(
        url,
        { method: 'PUT', headers: { ...headers, 'Content-Type': contentType }, body: data as BodyInit },
        '写入云端文件',
      );
      if (!response.ok) throw await describeFailure('写入云端文件', response);
    },

    async remove(key: string): Promise<void> {
      const url = resolveKey(root, key);
      const response = await request(url, { method: 'DELETE', headers }, '删除云端文件');
      // 404 表示目标本来就不在，符合「删除后不存在」的预期
      if (!response.ok && response.status !== 404) {
        throw await describeFailure('删除云端文件', response);
      }
    },
  };
};
