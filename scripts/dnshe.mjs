// DNSHE 免费域名 API 客户端(V2.0,零依赖)
//
// 官方文档: https://my.dnshe.com/knowledgebase/13/DNSHE-Free-Domain-API-User-Guide-V2.0.html
// 认证: 请求头 X-API-Key + X-API-Secret
// 续期窗口: 到期前 180 天开启,免费(charged_amount=0)
//
// 多账号: DNSHE_API_KEY 与 DNSHE_API_SECRET 都支持一行一个,按行一一对应
const BASE_URL = process.env.DNSHE_BASE_URL || 'https://api005.dnshe.com/index.php';
const PAGE_SIZE = Number.parseInt(process.env.DNSHE_PAGE_SIZE || '200', 10);

/** 解析多账号凭据:Key 与 Secret 按行配对(一行一个账号);返回 { pairs, invalid, duplicates } */
export function parseDnsheCreds(rawKey, rawSecret) {
  const split = (s) => String(s ?? '').split(/[\r\n]+/).map((v) => v.trim()).filter(Boolean);
  const keys = split(rawKey);
  const secrets = split(rawSecret);
  const pairs = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();
  const total = Math.max(keys.length, secrets.length);

  for (let i = 0; i < total; i += 1) {
    const index = i + 1;
    const key = keys[i];
    const secret = secrets[i];
    if (!key || !secret) {
      invalid.push({ index, reason: 'API Key 与 API Secret 行数不一致(需要一行一组、按行对应)' });
      continue;
    }
    if (!key.startsWith('cfsd_')) {
      invalid.push({ index, reason: 'API Key 不以 cfsd_ 开头' });
      continue;
    }
    if (secret.length < 16) {
      invalid.push({ index, reason: 'API Secret 长度异常(应为一长串十六进制字符)' });
      continue;
    }
    const signature = `${key}\u0000${secret}`;
    if (seen.has(signature)) {
      duplicates.push(index);
      continue;
    }
    seen.add(signature);
    pairs.push({ key, secret });
  }

  return { pairs, invalid, duplicates };
}

/** 调用 DNSHE API;HTTP 非 2xx 或 success=false 时抛错(带 status / errorCode / 原始 payload) */
async function call(params, { key, secret, method = 'GET', body } = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set('m', 'domain_hub');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': key,
      'X-API-Secret': secret,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (!res.ok || json?.success === false) {
    const code = json?.error_code ? ` ${json.error_code}` : '';
    const msg = json?.message || json?.error || text.slice(0, 200);
    const err = new Error(`HTTP ${res.status}${code}: ${msg}`);
    err.status = res.status;
    err.errorCode = json?.error_code;
    err.payload = json;
    throw err;
  }
  return json;
}

/** 列出账号下所有子域名(自动翻页) */
export async function listSubdomains(creds) {
  const out = [];
  for (let page = 1; page <= 50; page += 1) {
    const r = await call({ endpoint: 'subdomains', action: 'list', page, per_page: PAGE_SIZE, include_total: 1 }, creds);
    const items = Array.isArray(r?.subdomains) ? r.subdomains : [];
    out.push(...items);
    const hasMore = r?.pagination?.has_more ?? (items.length >= PAGE_SIZE);
    if (!hasMore || items.length === 0) break;
  }
  return out;
}

/** 续期子域名(参数为 subdomain_id;窗口外会抛 422 renewal_not_yet_available) */
export async function renewSubdomain(subdomainId, creds) {
  return call({ endpoint: 'subdomains', action: 'renew' }, { ...creds, method: 'POST', body: { subdomain_id: subdomainId } });
}
