#!/usr/bin/env node
// 辅助工具:打印域名检查表格(不修改任何数据)。
// 用法:  DIGITALPLAT_API_KEY=dp_live_xxx node scripts/list-domains.mjs
//       多账号: DIGITALPLAT_API_KEY 一行一个 Key(也兼容英文逗号分隔)
// 加 --json 参数可同时打印接口完整原始响应(排查用)。
import { parseApiKeys } from './keys.mjs';

const BASE_URL = process.env.DIGITALPLAT_BASE_URL || 'https://domain-api.digitalplat.org/api/v1';
const PRINT_JSON = process.argv.includes('--json');
const THRESHOLD_DAYS = Number.parseInt(process.env.RENEW_THRESHOLD_DAYS || '120', 10);

const { keys: API_KEYS, invalid, duplicates } = parseApiKeys(process.env.DIGITALPLAT_API_KEY || '');
if (invalid.length > 0) {
  for (const { index, reason } of invalid) {
    console.error(`DIGITALPLAT_API_KEY 第 ${index} 个条目无效: ${reason}`);
  }
  process.exit(2);
}
if (API_KEYS.length === 0) {
  console.error('缺少 DIGITALPLAT_API_KEY(应以 dp_live_ 或 dp_test_ 开头)');
  process.exit(2);
}
for (const index of duplicates) {
  console.warn(`DIGITALPLAT_API_KEY 第 ${index} 个条目与前面的 Key 重复,已忽略`);
}
const multi = API_KEYS.length > 1;

/** 列出一个账号下的所有域名(兼容 data 是数组,或 data 里再包一层 domains/items) */
async function listDomains(apiKey) {
  const r = await fetch(`${BASE_URL}/domains`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  if (PRINT_JSON) console.log('=== 完整原始响应 ===\n' + JSON.stringify(json, null, 2) + '\n');
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.domains)) return json.data.domains;
  if (Array.isArray(json?.data?.items)) return json.data.items;
  return [];
}

const accounts = [];
let failures = 0;
for (let i = 0; i < API_KEYS.length; i += 1) {
  const label = `#${i + 1}`;
  try {
    accounts.push({ label, domains: await listDomains(API_KEYS[i]) });
  } catch (e) {
    failures += 1;
    accounts.push({ label, domains: [], error: e.message });
    console.error(`${label} 获取域名列表失败: ${e.message}`);
  }
}

function fmtTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  const sep = '  ' + widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(headers), sep, ...rows.map((r) => line(r))].join('\n');
}

/** 解析到期日:支持 YYYY-MM-DD、YYYYMMDD、ISO 时间戳;失败返回 null */
function parseDate(expiry) {
  if (!expiry) return null;
  const s = String(expiry).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) || /^(\d{4})(\d{2})(\d{2})/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 计算到期日距今天的天数;无法解析返回 null */
function daysUntil(expiry) {
  const p = parseDate(expiry);
  if (!p) return null;
  const exp = Date.UTC(p[0], p[1] - 1, p[2]);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((exp - today) / 86400000);
}

/** 格式化到期时间为 YYYY-MM-DD;无法解析则原样截断 */
function fmtDate(expiry) {
  const p = parseDate(expiry);
  if (!p) return expiry ? String(expiry).slice(0, 10) : '永久';
  return `${p[0]}-${String(p[1]).padStart(2, '0')}-${String(p[2]).padStart(2, '0')}`;
}

const totalDomains = accounts.reduce((n, a) => n + a.domains.length, 0);
console.log(`共 ${totalDomains} 个域名${multi ? `(${API_KEYS.length} 个账号)` : ''}:\n`);
// DigitalPlat 实际字段: domain / expires_at / slot_type / auto_renew
const rows = [];
for (const acc of accounts) {
  for (const d of acc.domains) {
    const name = d.domain ?? d.name ?? d.hostname ?? String(d.id ?? '?');
    const expiry = d.expires_at ?? d.expiry_date ?? '永久';
    const days = daysUntil(d.expires_at ?? d.expiry_date);
    const status = days === null ? '永久有效' : days <= THRESHOLD_DAYS ? '窗口内' : '窗口外';
    rows.push([...(multi ? [acc.label] : []), name, status, fmtDate(expiry), days === null ? '永久' : `${days}天`, d.auto_renew ? '是' : '否']);
  }
}
console.log(fmtTable([...(multi ? ['账号'] : []), '域名', '状态', '到期时间', '剩余天数', '自动续'], rows));
console.log('');
console.log('说明: 状态=窗口内(到期前120天内,将自动申请免费续费) / 窗口外(暂不需续费) / 永久有效(接口无到期时间)');
if (failures > 0) process.exit(1);
