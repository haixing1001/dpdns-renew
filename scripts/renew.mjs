#!/usr/bin/env node
// 多平台免费域名自动续期(DigitalPlat + DNSHE,零第三方依赖,Node.js 18+ 自带 fetch)
//
// 配置(至少配置一个平台,未配置的平台会被跳过):
//   DigitalPlat: DIGITALPLAT_API_KEY,一行一个 Key(每个账号一行;也兼容英文逗号分隔)
//   DNSHE:       DNSHE_API_KEY,一行一个账号,写成 "cfsd_xxx----API-Secret"(空格/逗号/冒号也兼容)
//
// 用法示例:
//   单平台: DIGITALPLAT_API_KEY="dp_live_xxx" node scripts/renew.mjs
//   双平台: export DIGITALPLAT_API_KEY=$'dp_live_aaa\ndp_live_bbb'
//           export DNSHE_API_KEY="cfsd_xxx----yyyyyyyy"
//           node scripts/renew.mjs
//
// 内置默认规则(可用环境变量覆盖):
//   - 续期窗口:  DigitalPlat 到期前 120 天 / DNSHE 到期前 180 天(官方窗口)
//   - 每次续期:  1 年(免费)
//   - 真实运行:  默认直接续期;加 --dry-run 参数(或 DRY_RUN=true)只预览不动手
//   - 诊断:      加 --json 参数会打印接口完整原始响应
//
// 可选环境变量:
//   DIGITALPLAT_BASE_URL / DNSHE_BASE_URL    API 地址
//   RENEW_THRESHOLD_DAYS        DigitalPlat 提前续期天数,默认 120
//   DNSHE_RENEW_THRESHOLD_DAYS  DNSHE 提前续期天数,默认 180
//   RENEW_YEARS                 每次续期年数,默认 1
//   RENEW_PAYMENT_METHOD        统一指定支付方式(默认空 = 按域名类型自动选)
//   RENEW_PAYMENT_FREE          免费域名支付方式,默认 free
//   RENEW_PAYMENT_PAID          其他域名支付方式,默认 credits
//   RENEW_DELAY_MS              每个请求间隔毫秒,默认 300
//   DRY_RUN                     true/false 是否只预览
import { setTimeout as sleep } from 'node:timers/promises';
import { appendFileSync } from 'node:fs';
import { buildAccounts, DP_THRESHOLD, DNSHE_THRESHOLD } from './accounts.mjs';

const DELAY_MS = Number.parseInt(process.env.RENEW_DELAY_MS || '300', 10);
const DRY_RUN = process.argv.includes('--dry-run') || (process.env.DRY_RUN || '').toLowerCase() === 'true';
const PRINT_JSON = process.argv.includes('--json');

/** 解析日期:支持 YYYY-MM-DD、YYYYMMDD、ISO 时间戳;失败返回 null */
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

/** 简单对齐表格(控制台日志用) */
function fmtTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  const sep = '  ' + widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(headers), sep, ...rows.map((r) => line(r))].join('\n');
}

/** Markdown 表格(GitHub Actions Job Summary 用) */
function mdTable(headers, rows) {
  return [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...rows.map((r) => '| ' + r.map((c) => String(c ?? '')).join(' | ') + ' |'),
  ].join('\n');
}

/** 配色:GitHub Summary 会剥离 HTML style,故用 emoji 圆点着色 */
function daysDot(days, threshold) {
  if (days === null || days === undefined) return '⚪';
  if (days < 0) return '🔴';                    // 已过期
  if (days <= 30) return '🔴';                  // 30 天内临期
  if (days <= threshold) return '🟡';           // 续期窗口内
  return '🟢';                                  // 安全
}
/** 状态配色:窗口内🔴 / 窗口外🟢 / 永久有效⚪ / 未知⚪ */
function statusDot(status) {
  if (status === '窗口内') return '🔴';
  if (status === '窗口外') return '🟢';
  return '⚪';
}
/** 自动续:是✅ / 否➖ / 不支持— */
function autoDot(v) {
  if (v === '是') return '✅ 是';
  if (v === '否') return '➖ 否';
  return '—';
}

async function main() {
  const { accounts, errors, warnings } = buildAccounts();

  if (errors.length > 0) {
    for (const e of errors) console.error(`[renew] ${e}`);
    console.error('[renew] 请检查配置:DigitalPlat 一行一个 Key;DNSHE 一行一个账号,写成 "cfsd_xxx----API-Secret"');
    process.exit(2);
  }
  if (accounts.length === 0) {
    console.error('[renew] 未配置任何平台的 API 凭据');
    console.error('       DigitalPlat: DIGITALPLAT_API_KEY="dp_live_xxx"(多账号一行一个)');
    console.error('       DNSHE:       DNSHE_API_KEY="cfsd_xxx----API-Secret"(多账号一行一个)');
    process.exit(2);
  }
  for (const w of warnings) console.warn(`[renew] ${w}`);

  const providers = [...new Set(accounts.map((a) => a.provider))];
  const showProvider = providers.length > 1;
  const showAccount = accounts.length > 1;
  const tagOf = (row) => [showProvider ? row.provider : '', showAccount ? row.account : ''].filter(Boolean).join(' ');
  const accTag = (acc) => [showProvider ? acc.provider : '', showAccount ? acc.label : ''].filter(Boolean).join(' ') || acc.provider;

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  console.log(`[renew] 域名检查 (${ts})`);
  console.log(`[renew] 平台: ${providers.join(' + ')} · 账号: ${accounts.length} 个`);
  console.log(`[renew] 规则: DigitalPlat 到期前 ${DP_THRESHOLD} 天 / DNSHE 到期前 ${DNSHE_THRESHOLD} 天进入续期窗口,自动续期`);

  // 1) 逐个账号列出域名;单个账号失败(Key 失效/网络异常)不影响其他账号继续处理
  const listing = [];
  let accountFailures = 0;
  for (let i = 0; i < accounts.length; i += 1) {
    const acc = accounts[i];
    try {
      const domains = await acc.list();
      listing.push({ acc, domains });
      if (PRINT_JSON) console.log(`=== ${accTag(acc)} 完整原始响应 ===\n` + JSON.stringify(domains.map((d) => d.raw ?? d), null, 2));
    } catch (e) {
      accountFailures += 1;
      listing.push({ acc, domains: [], error: e.message });
      console.error(`[renew] ${accTag(acc)} 获取域名列表失败: ${e.message}`);
    }
    if (DELAY_MS > 0 && i < accounts.length - 1) await sleep(DELAY_MS);
  }

  const totalDomains = listing.reduce((n, a) => n + a.domains.length, 0);
  console.log(`[renew] 共 ${totalDomains} 个域名\n`);

  // 2) 生成检查表
  const rows = [];
  for (const { acc, domains } of listing) {
    for (const d of domains) {
      const days = d.neverExpires ? null : daysUntil(d.expiry);
      let status;
      if (d.neverExpires) status = '永久有效';
      else if (days === null) status = '未知';
      else if (days <= acc.threshold) status = '窗口内';
      else status = '窗口外';
      rows.push({
        provider: acc.provider,
        account: acc.label,
        name: d.name,
        expiry: d.expiry,
        days,
        status,
        threshold: acc.threshold,
        autoRenew: d.autoRenew,
        isFree: d.isFree,
        renewId: d.renewId,
        raw: d.raw,
        renewer: acc.renew,
      });
    }
  }

  const tableHeaders = [
    ...(showProvider ? ['平台'] : []),
    ...(showAccount ? ['账号'] : []),
    '域名', '状态', '到期时间', '剩余天数', '自动续',
  ];
  const tableRows = rows.map((r) => [
    ...(showProvider ? [r.provider] : []),
    ...(showAccount ? [r.account] : []),
    r.name,
    `${statusDot(r.status)} ${r.status}`,
    fmtDate(r.expiry),
    r.days === null ? '⚪ 永久' : `${daysDot(r.days, r.threshold)} ${r.days}天`,
    autoDot(r.autoRenew),
  ]);
  console.log(fmtTable(tableHeaders, tableRows));
  console.log('');

  // 3) 自动续期明细:只处理窗口内的域名,用域名所属账号的凭据
  const due = rows.filter((r) => r.status === '窗口内');
  console.log(`[renew] 自动续期明细(${due.length} 个进入续期窗口):`);
  const results = [];
  let failures = 0;
  let skipped = 0;
  for (const r of due) {
    const tag = tagOf(r);
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] ${tag}${r.name} 剩余 ${r.days} 天,将续期`);
      results.push({ name: r.name, provider: r.provider, account: r.account, action: 'dry-run-将续期' });
      continue;
    }
    const outcome = await r.renewer(r);
    if (outcome.ok) {
      console.log(`  ✔ ${tag}${r.name} 续期成功${outcome.note ? `(${outcome.note})` : ''}`);
      results.push({ name: r.name, provider: r.provider, account: r.account, action: 'renewed' });
    } else if (outcome.skip) {
      skipped += 1;
      console.log(`  ⏭ ${tag}${r.name} 跳过: ${outcome.error}`);
      results.push({ name: r.name, provider: r.provider, account: r.account, action: 'skipped', error: outcome.error });
    } else {
      failures += 1;
      console.error(`  ✘ ${tag}${r.name} 续期失败: ${outcome.error}`);
      results.push({ name: r.name, provider: r.provider, account: r.account, action: 'failed', error: outcome.error });
    }
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }
  if (due.length === 0) console.log('  (暂无到期域名,全部在窗口外或永久有效)');

  // 4) 汇总
  const renewed = results.filter((x) => x.action === 'renewed').length;
  const will = results.filter((x) => x.action === 'dry-run-将续期').length;
  console.log(`\n[renew] 完成: 平台 ${providers.length} 个,账号 ${accounts.length} 个(异常 ${accountFailures} 个),域名 ${totalDomains} 个,窗口内 ${due.length} 个,续期 ${renewed} 个${DRY_RUN ? `(DRY-RUN 将续 ${will} 个)` : ''}${skipped > 0 ? `,跳过 ${skipped} 个` : ''},失败 ${failures} 个`);

  // 5) 写入 GitHub Actions Job Summary(运行页 Summary 区直接展示,无需展开步骤日志)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const md = [
      `## 📋 域名检查 (${ts})`,
      '',
      `共 ${providers.length} 个平台 · ${accounts.length} 个账号 · ${totalDomains} 个域名 · 续期窗口: DigitalPlat ${DP_THRESHOLD} 天 / DNSHE ${DNSHE_THRESHOLD} 天`,
      '',
      '> 🟢 安全 · 🟡 续期窗口内 · 🔴 临期(≤30天)/过期 · ⚪ 永久',
      '',
      mdTable(tableHeaders, tableRows),
      '',
      '### 自动续期明细',
    ];
    if (due.length === 0) md.push('暂无到期域名,全部在窗口外或永久有效');
    for (const r of due) {
      const tag = tagOf(r);
      const done = results.find((x) => x.name === r.name && x.account === r.account);
      if (DRY_RUN) md.push(`- 🟡 ${tag}${r.name}: 剩余 ${r.days} 天,将续期(预览)`);
      else if (done?.action === 'renewed') md.push(`- ✅ ${tag}${r.name}: 续期成功 +1 年`);
      else if (done?.action === 'skipped') md.push(`- ⏭ ${tag}${r.name}: 跳过(${done.error})`);
      else md.push(`- ❌ ${tag}${r.name}: 续期失败`);
    }
    const failedAccounts = listing.filter((a) => a.error);
    if (failedAccounts.length > 0) {
      md.push('', '### ⚠️ 账号异常', '');
      for (const a of failedAccounts) md.push(`- ❌ ${accTag(a.acc)}: 获取域名列表失败(${String(a.error).slice(0, 200)})`);
    }
    try {
      appendFileSync(summaryPath, md.join('\n') + '\n');
      console.log('[renew] 已写入 Job Summary');
    } catch (e) {
      console.warn('[renew] 写入 Job Summary 失败(不影响续期):', e.message);
    }
  }

  if (failures > 0 || accountFailures > 0) {
    console.error('[renew] 存在失败项,退出码 1(便于 GitHub Actions 邮件通知)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
