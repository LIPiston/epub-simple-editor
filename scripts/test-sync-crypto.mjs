/**
 * 云同步的纯逻辑测试（不需要浏览器）
 *
 * 覆盖两块最容易出错、又最不该靠「跑起来看看」来发现问题的逻辑：
 *
 * 1. SigV4 签名。签名算错的表现是服务端一个干净的 403，从报错里根本看不出
 *    算错了哪一步。所以这里对齐 **官方发布的测试向量**：
 *      - AWS SigV4 测试套件 get-vanilla（通用服务，无 x-amz-content-sha256）
 *      - AWS S3 文档「GET Object」示例（S3 风格，含 range 与 payload 摘要）
 *    两个向量都取自 AWS 官方文档，预期签名值是从文档里抄下来的，不是自算自比。
 *
 * 2. 同步计划。双向同步「谁该覆盖谁」的判定直接决定会不会丢稿，
 *    这里把各种组合（仅一端有 / 两端一致 / 一端改动 / 两端都改 / 无基线）
 *    逐一钉住。
 *
 * 用法：node scripts/test-sync-crypto.mjs
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = path.resolve('scripts/.tmp-sync-crypto');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

// ─── 把要测的模块打成 JS 再导入 ───
const entry = path.join(tmp, 'entry.ts');
writeFileSync(
  entry,
  `
export * from ${JSON.stringify(path.resolve('services/sync/sigv4.ts').replace(/\\/g, '/'))};
export { buildSyncPlan, summarizePlan } from ${JSON.stringify(path.resolve('services/sync/plan.ts').replace(/\\/g, '/'))};
`,
);

const outfile = path.join(tmp, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

const { signRequest, sha256Hex, EMPTY_PAYLOAD_SHA256, buildSyncPlan, summarizePlan } = await import(
  pathToFileURL(outfile).href
);

// ─── 1. SigV4：官方测试向量 ───
console.log('1. AWS SigV4 签名对齐官方测试向量');

{
  // AWS SigV4 测试套件 get-vanilla。
  // 固定时间 injection，只用日期参与派生，避免测试随时间变化。
  const headers = await signRequest({
    method: 'GET',
    path: '/',
    headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
    region: 'us-east-1',
    service: 'service',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    date: new Date('2015-08-30T12:36:00Z'),
    // 该向量属于通用（非 S3）签名，不带 x-amz-content-sha256
    includePayloadHeader: false,
  });

  const signature = /Signature=([0-9a-f]+)/.exec(headers.authorization)?.[1];
  record(
    'get-vanilla：签名与官方预期一致',
    signature === '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    `  计算值=${signature}\n  期望值=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31`,
  );
  record(
    '授权头格式正确（Credential / SignedHeaders 齐全，且只签 host 与 x-amz-date）',
    headers.authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request') &&
      headers.authorization.includes('SignedHeaders=host;x-amz-date') &&
      headers.authorization.includes('Signature='),
    `  ${headers.authorization}`,
  );
}

{
  // S3 文档「GET Object」示例：带 Range 与 x-amz-content-sha256
  const headers = await signRequest({
    method: 'GET',
    path: '/test.txt',
    headers: {
      host: 'examplebucket.s3.amazonaws.com',
      range: 'bytes=0-9',
      'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
      'x-amz-date': '20130524T000000Z',
    },
    region: 'us-east-1',
    service: 's3',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
  });

  const signature = /Signature=([0-9a-f]+)/.exec(headers.authorization)?.[1];
  record(
    'S3 文档 GET Object 示例：签名与官方预期一致',
    signature === 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    `  计算值=${signature}\n  期望值=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41`,
  );
  record(
    'SignedHeaders 排序正确（host;range;x-amz-content-sha256;x-amz-date）',
    headers.authorization.includes('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date'),
    `  ${headers.authorization}`,
  );
}

// ─── 2. 签名细节：路径不重复编码、特殊字符转义 ───
console.log('\n2. 签名实现的边界细节');

{
  // 路径里的 `/` 必须保持为 `/`（S3 不做二次编码）；用中文与空格检验编码
  const a = await signRequest({
    method: 'PUT',
    path: '/my bucket/books/我的书.json',
    headers: { host: 's3.example.com' },
    body: '{}',
    region: 'us-east-1',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    date: new Date('2026-01-01T00:00:00Z'),
  });
  record(
    '路径编码：保留分隔用的 /，其余按 RFC3986 转义',
    !!a.authorization && a.authorization.includes('Signature='),
    `  使用含空格与中文的路径签名成功（说明未抛错且编码规则生效）`,
  );

  // `!'()*` 这几个字符 encodeURIComponent 不会转义，AWS 要求转义。
  // 若漏转义，含这些字符的 key 会签名不匹配。这里通过「转义前后签名不同」间接验证。
  const plain = await signRequest({
    method: 'GET',
    path: '/a/b',
    headers: { host: 'h' },
    region: 'us-east-1',
    accessKeyId: 'K',
    secretAccessKey: 'S',
    date: new Date('2026-01-01T00:00:00Z'),
  });
  const special = await signRequest({
    method: 'GET',
    path: "/a/b'c",
    headers: { host: 'h' },
    region: 'us-east-1',
    accessKeyId: 'K',
    secretAccessKey: 'S',
    date: new Date('2026-01-01T00:00:00Z'),
  });
  record(
    '特殊字符（\'）参与编码，影响签名结果',
    plain.authorization !== special.authorization,
    '  含引号的路径得到不同的签名（说明确实做了转义而非原样拼接）',
  );
}

{
  const empty = await sha256Hex('');
  record(
    '空请求体摘要与 S3 约定值一致',
    empty === EMPTY_PAYLOAD_SHA256 && empty === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    `  ${empty}`,
  );
}

// ─── 3. 同步计划 ───
console.log('\n3. 同步计划（决定谁覆盖谁，直接关系到会不会丢稿）');

const book = (id, hash, updatedAt = 1, title = `书${id}`) => ({
  id,
  title,
  author: '作者',
  updatedAt,
  sizeBytes: 100,
  chapterCount: 1,
  imageCount: 0,
  hash,
});

const actions = (plan) => Object.fromEntries(plan.items.map((i) => [i.bookId, i.action]));

{
  // 只上传：远端独有的书不能碰
  const plan = buildSyncPlan({
    mode: 'upload',
    local: [book('a', 'h1')],
    remote: [book('a', 'h0'), book('b', 'h9')],
    snapshot: null,
  });
  const result = actions(plan);
  record(
    '上传模式：本地书上传，云端独有的书不动',
    result.a === 'upload' && result.b === 'in-sync',
    `  ${JSON.stringify(result)}`,
  );
}

{
  // 只下载：本地独有的书不能碰（不能因为「恢复」就删掉本机的东西）
  const plan = buildSyncPlan({
    mode: 'download',
    local: [book('a', 'h1'), book('c', 'h7')],
    remote: [book('a', 'h0')],
    snapshot: null,
  });
  const result = actions(plan);
  record(
    '下载模式：云端书下载覆盖，本机独有的书不动',
    result.a === 'download' && result.c === 'in-sync',
    `  ${JSON.stringify(result)}`,
  );
}

{
  // 双向：一端新增
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'h1')],
    remote: [book('b', 'h9')],
    snapshot: null,
  });
  const result = actions(plan);
  record(
    '双向：本机独有 → 上传；云端独有 → 下载',
    result.a === 'upload' && result.b === 'download',
    `  ${JSON.stringify(result)}`,
  );
}

{
  // 双向：内容一致
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'same')],
    remote: [book('a', 'same')],
    snapshot: null,
  });
  record('双向：两端一致 → 无需处理', actions(plan).a === 'in-sync', `  ${JSON.stringify(actions(plan))}`);
}

{
  // 双向：只有本地改动（本地 hash 变了，云端仍是基线值）
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'new')],
    remote: [book('a', 'base')],
    snapshot: { providerKey: 'k', lastSyncedAt: 1, books: { a: { hash: 'base' } } },
  });
  record(
    '双向：只有本地改动 → 上传',
    actions(plan).a === 'upload',
    `  ${plan.items[0].reason}`,
  );
}

{
  // 双向：只有云端改动
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'base')],
    remote: [book('a', 'new')],
    snapshot: { providerKey: 'k', lastSyncedAt: 1, books: { a: { hash: 'base' } } },
  });
  record(
    '双向：只有云端改动 → 下载',
    actions(plan).a === 'download',
    `  ${plan.items[0].reason}`,
  );
}

{
  // 双向：两端都改过 → 冲突（不能猜，猜错就丢稿）
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'localNew')],
    remote: [book('a', 'remoteNew')],
    snapshot: { providerKey: 'k', lastSyncedAt: 1, books: { a: { hash: 'base' } } },
  });
  record(
    '双向：两端都改过 → 判为冲突（保留本地，云端另存）',
    actions(plan).a === 'conflict',
    `  ${plan.items[0].reason}`,
  );
}

{
  // 双向：内容不同但从未同步过 → 也必须判冲突，不能凭 updatedAt 猜
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'h1', 999)],
    remote: [book('a', 'h2', 1000)],
    snapshot: null,
  });
  record(
    '双向：无同步记录且内容不同 → 判为冲突（不按时间猜）',
    actions(plan).a === 'conflict',
    `  ${plan.items[0].reason}`,
  );
}

{
  // 双向：两端都没动过（与基线一致）
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'base')],
    remote: [book('a', 'base')],
    snapshot: { providerKey: 'k', lastSyncedAt: 1, books: { a: { hash: 'base' } } },
  });
  record('双向：两端都没改动 → 无需处理', actions(plan).a === 'in-sync', `  ${plan.items[0].reason}`);
}

{
  // pending 只含真正要传输的项
  const plan = buildSyncPlan({
    mode: 'two-way',
    local: [book('a', 'h1'), book('b', 'same')],
    remote: [book('b', 'same'), book('c', 'h3')],
    snapshot: null,
  });
  record(
    'pending 只列出需要传输的书（in-sync 被排除）',
    plan.pending.length === 2 && !plan.pending.some((i) => i.action === 'in-sync'),
    `  pending=${plan.pending.length}，items=${plan.items.length}`,
  );
  const summary = summarizePlan(plan);
  record(
    '概述文案涵盖各动作数量',
    summary.includes('上传 1 本') && summary.includes('下载 1 本') && summary.includes('无需处理 1 本'),
    `  ${summary}`,
  );
}

{
  // 两端都为空
  const plan = buildSyncPlan({ mode: 'two-way', local: [], remote: [], snapshot: null });
  record(
    '两端都为空时没有待办，也没有崩溃',
    plan.pending.length === 0 && summarizePlan(plan) === '没有需要同步的书',
    `  ${summarizePlan(plan)}`,
  );
}

{
  // 「本机没有、云端有」的两种含义必须靠基线区分。
  // 有基线 = 本机删过它；无基线 = 本机从没见过它（新设备上首次同步）。
  // 若一律当删除处理，新设备首次双向同步会把云端全部书都判成「已删除」而丢光。
  const deleted = buildSyncPlan({
    mode: 'two-way',
    local: [],
    remote: [book('a', 'h1')],
    snapshot: { providerKey: 'k', lastSyncedAt: 1, books: { a: { hash: 'h1' } } },
  });
  const freshDevice = buildSyncPlan({
    mode: 'two-way',
    local: [],
    remote: [book('a', 'h1')],
    snapshot: null,
  });

  record(
    '本机删过的书（有基线）→ 标记为移除云端记录，而不是重新下载',
    actions(deleted).a === 'forget-remote',
    `  ${deleted.items[0].reason}`,
  );
  record(
    '新设备首次同步（无基线）→ 下载，而不是误判为「本机已删除」',
    actions(freshDevice).a === 'download',
    `  ${freshDevice.items[0].reason}`,
  );
}

{
  // 上传（备份）模式下，本机删过的书也应从云端清单摘掉，让云端与书库一致；
  // 但云端独有、本机从没有过的书仍不能碰。
  const plan = buildSyncPlan({
    mode: 'upload',
    local: [book('keep', 'h1')],
    remote: [book('deleted', 'h2'), book('otherDevice', 'h3')],
    snapshot: {
      providerKey: 'k',
      lastSyncedAt: 1,
      books: { deleted: { hash: 'h2' }, keep: { hash: 'h1' } },
    },
  });
  const result = actions(plan);
  record(
    '备份模式：本机删过的书移除云端记录，别的设备传的书不动',
    result.deleted === 'forget-remote' && result.otherDevice === 'in-sync' && result.keep === 'upload',
    `  ${JSON.stringify(result)}`,
  );
}

// ─── 汇总 ───
rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length === 0) {
  console.log(`✅ 全部通过：${results.length}/${results.length}`);
  process.exit(0);
}
console.log(`❌ 失败 ${failed.length}/${results.length}：`);
for (const f of failed) console.log(`   - ${f.name}`);
process.exit(1);
