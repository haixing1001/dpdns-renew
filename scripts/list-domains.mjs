#!/usr/bin/env node
// 辅助工具:打印域名检查表格(不修改任何数据)。
// 用法:  DIGITALPLAT_API_KEY=dp_live_xxx node scripts/list-domains.mjs
//        DNSHE_API_KEY=cfsd_xxx DNSHE_API_SECRET=yyy node scripts/list-domains.mjs
// 加 --json 参数可同时打印接口完整原始响应(排查用)。
import { buildAccounts } from './accounts.mjs';

const PRINT_JSON = process.argv.includes('--json');

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

function fmtTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  const sep = '  ' + widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(headers), sep, ...rows.map((r) => line(r))].join('\n');
}

const { accounts, errors, warnings } = buildAccounts();

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error('请检查配置:DigitalPlat 一行一个 Key;DNSHE 的 API Key 与 API Secret 一行一组、按行对应');
  process.exit(2);
}
if (accounts.length === 0) {
  console.error('未配置任何平台的 API 凭据(DIGITALPLAT_API_KEY 或 DNSHE_API_KEY + DNSHE_API_SECRET)');
  process.exit(2);
}
for (const w of warnings) console.warn(w);

const providers = [...new Set(accounts.map((a) => a.provider))];
const showProvider = providers.length > 1;
const showAccount = accounts.length > 1;

const listing = [];
let failures = 0;
for (const acc of accounts) {
  const tag = [showProvider ? acc.provider : '', showAccount ? acc.label : ''].filter(Boolean).join(' ');
  try {
    const domains = await acc.list();
    listing.push({ acc, domains });
    if (PRINT_JSON) console.log(`=== ${tag || acc.provider} 完整原始响应 ===\n` + JSON.stringify(domains.map((d) => d.raw ?? d), null, 2) + '\n');
  } catch (e) {
    failures += 1;
    listing.push({ acc, domains: [], error: e.message });
    console.error(`${tag || acc.provider} 获取域名列表失败: ${e.message}`);
  }
}

const totalDomains = listing.reduce((n, a) => n + a.domains.length, 0);
const meta = [showProvider ? `${providers.length} 个平台` : '', showAccount ? `${accounts.length} 个账号` : ''].filter(Boolean).join(', ');
console.log(`共 ${totalDomains} 个域名${meta ? `(${meta})` : ''}:\n`);

const rows = [];
for (const { acc, domains } of listing) {
  for (const d of domains) {
    const days = d.neverExpires ? null : daysUntil(d.expiry);
    const status = d.neverExpires ? '永久有效' : days === null ? '未知' : days <= acc.threshold ? '窗口内' : '窗口外';
    rows.push([
      ...(showProvider ? [acc.provider] : []),
      ...(showAccount ? [acc.label] : []),
      d.name,
      status,
      fmtDate(d.expiry),
      days === null ? '永久' : `${days}天`,
      d.autoRenew,
    ]);
  }
}
console.log(fmtTable([
  ...(showProvider ? ['平台'] : []),
  ...(showAccount ? ['账号'] : []),
  '域名', '状态', '到期时间', '剩余天数', '自动续',
], rows));
console.log('');
console.log('说明: 状态=窗口内(进入续期窗口,将自动免费续期) / 窗口外(暂不需续费) / 永久有效(接口无到期时间)');
if (failures > 0) process.exit(1);
