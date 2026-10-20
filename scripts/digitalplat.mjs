// DigitalPlat 域名 API 客户端(零依赖,Node 18+ 自带 fetch)
import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.DIGITALPLAT_BASE_URL || 'https://domain-api.digitalplat.org/api/v1';
const YEARS = Number.parseInt(process.env.RENEW_YEARS || '1', 10);
// 空 = 按域名类型自动选择(free 域名用 PAYMENT_FREE,其余用 PAYMENT_PAID)
const PAYMENT_METHOD = process.env.RENEW_PAYMENT_METHOD || '';
const PAYMENT_FREE = process.env.RENEW_PAYMENT_FREE || 'free';
const PAYMENT_PAID = process.env.RENEW_PAYMENT_PAID || 'credits';

/** 封装 API 调用(每个账号用各自的 Key),返回解析后的 JSON;失败抛错(带状态和响应摘要)
 *  写操作自动携带 Idempotency-Key(服务端强制,缺失返回 400 idempotency_key_required);
 *  传入 idemKey 可让重试复用同一把键,避免"第一次其实已成功、重试又续一年" */
async function api(path, apiKey, { method = 'GET', body, idemKey } = {}) {
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(isWrite ? { 'Idempotency-Key': idemKey || randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const detail = json ? JSON.stringify(json).slice(0, 400) : text.slice(0, 400);
    throw new Error(`HTTP ${res.status} ${method} ${path} -> ${detail}`);
  }
  return json;
}

/** 列出一个账号下的所有域名(兼容 data 为数组,或 data 内嵌 domains/items) */
export async function listDomains(apiKey) {
  const r = await api('/domains', apiKey);
  if (Array.isArray(r?.data)) return r.data;
  if (Array.isArray(r?.data?.domains)) return r.data.domains;
  if (Array.isArray(r?.data?.items)) return r.data.items;
  return [];
}

/** 续期一个域名(必须用该域名所属账号的 Key);free 域名在支付方式被拒时回退为不带支付方式重试一次 */
export async function renewDomain(name, isFree, apiKey) {
  // 同一域名的首发与回退重试共用同一把 Idempotency-Key(服务端按它去重)
  const idemKey = randomUUID();
  const attempt = async (body) => api(`/domains/${encodeURIComponent(name)}/renew`, apiKey, { method: 'POST', body, idemKey });
  const payment = PAYMENT_METHOD || (isFree ? PAYMENT_FREE : PAYMENT_PAID);
  try {
    const r = await attempt({ years: YEARS, payment_method: payment });
    return { ok: true, note: `payment=${payment}`, data: r?.data };
  } catch (firstErr) {
    if (isFree && !PAYMENT_METHOD) {
      // 免费域名:可能不接受自定义支付方式,改为不带 payment_method 再试一次
      try {
        const r2 = await attempt({ years: YEARS });
        return { ok: true, note: 'payment=auto(回退无payment)', data: r2?.data, retried: true };
      } catch { /* fall through */ }
    }
    return { ok: false, error: firstErr.message };
  }
}
