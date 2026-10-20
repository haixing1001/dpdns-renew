// 账号编排:把各平台的环境变量解析成统一的账号描述
//
// 每个账号:
//   provider  平台名(DigitalPlat / DNSHE)
//   label     平台内序号(#1、#2)
//   threshold 提前多少天进入续期窗口
//   list()    返回归一化域名 [{ name, expiry, neverExpires, autoRenew, isFree, renewId }]
//   renew(row) 续期并返回 { ok, note } / { ok:false, error } / { ok:false, skip:true, error }
import { parseApiKeys } from './keys.mjs';
import * as digitalplat from './digitalplat.mjs';
import * as dnshe from './dnshe.mjs';

const DP_THRESHOLD = Number.parseInt(process.env.RENEW_THRESHOLD_DAYS || '120', 10);
const DNSHE_THRESHOLD = Number.parseInt(process.env.DNSHE_RENEW_THRESHOLD_DAYS || '180', 10);

export { DP_THRESHOLD, DNSHE_THRESHOLD };

/** 解析环境变量,构建账号列表;配置错误通过 errors 返回(由调用方打印并退出) */
export function buildAccounts() {
  const accounts = [];
  const errors = [];
  const warnings = [];

  // ---------- DigitalPlat:一个 Key 一个账号 ----------
  const dpRaw = (process.env.DIGITALPLAT_API_KEY || '').trim();
  if (dpRaw) {
    const { keys, invalid, duplicates } = parseApiKeys(dpRaw);
    for (const { index, reason } of invalid) {
      errors.push(`DIGITALPLAT_API_KEY 第 ${index} 个条目无效: ${reason}`);
    }
    for (const index of duplicates) {
      warnings.push(`DIGITALPLAT_API_KEY 第 ${index} 个条目与前面的 Key 重复,已忽略`);
    }
    keys.forEach((key, i) => {
      accounts.push({
        provider: 'DigitalPlat',
        label: `#${i + 1}`,
        threshold: DP_THRESHOLD,
        async list() {
          const raw = await digitalplat.listDomains(key);
          return raw.map((d) => {
            const name = d.domain ?? d.name ?? d.hostname ?? String(d.id ?? '?');
            const expiry = d.expires_at ?? d.expiry_date ?? null;
            return {
              name,
              expiry,
              neverExpires: !expiry,
              autoRenew: d.auto_renew ? '是' : '否',
              isFree: (d.slot_type || d.lifecycle_type) === 'free',
              renewId: name,
              raw: d,
            };
          });
        },
        renew: (row) => digitalplat.renewDomain(row.name, row.isFree, key),
      });
    });
  }

  // ---------- DNSHE:一组 Key+Secret 一个账号 ----------
  const dnsheKeyRaw = process.env.DNSHE_API_KEY || '';
  const dnsheSecretRaw = process.env.DNSHE_API_SECRET || '';
  if (dnsheKeyRaw.trim() || dnsheSecretRaw.trim()) {
    const { pairs, invalid, duplicates } = dnshe.parseDnsheCreds(dnsheKeyRaw, dnsheSecretRaw);
    for (const { index, reason } of invalid) {
      errors.push(`DNSHE_API_KEY / DNSHE_API_SECRET 第 ${index} 组无效: ${reason}`);
    }
    for (const index of duplicates) {
      warnings.push(`DNSHE 第 ${index} 组凭据与前面的重复,已忽略`);
    }
    pairs.forEach((creds, i) => {
      accounts.push({
        provider: 'DNSHE',
        label: `#${i + 1}`,
        threshold: DNSHE_THRESHOLD,
        async list() {
          const raw = await dnshe.listSubdomains(creds);
          return raw.map((d) => ({
            name: d.full_domain || [d.subdomain, d.rootdomain].filter(Boolean).join('.'),
            expiry: d.expires_at ?? null,
            neverExpires: Number(d.never_expires) === 1 || !d.expires_at,
            autoRenew: '—',
            isFree: true,
            renewId: d.id,
            raw: d,
          }));
        },
        async renew(row) {
          try {
            const r = await dnshe.renewSubdomain(row.renewId, creds);
            const to = r?.new_expires_at ? `新到期 ${String(r.new_expires_at).slice(0, 10)}` : '';
            const fee = Number(r?.charged_amount ?? 0);
            return { ok: true, note: ['免费续期', to, fee > 0 ? `扣费 ${fee}` : ''].filter(Boolean).join(', ') };
          } catch (e) {
            // 窗口未开启:不是故障,记为跳过
            if (e.errorCode === 'renewal_not_yet_available') {
              const days = e.payload?.details?.days_until_window;
              return { ok: false, skip: true, error: `未进入续期窗口${Number.isFinite(days) ? `(还需 ${days} 天)` : ''}` };
            }
            return { ok: false, error: e.message };
          }
        },
      });
    });
  }

  return { accounts, errors, warnings };
}
