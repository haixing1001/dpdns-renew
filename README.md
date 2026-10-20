<div align="center">

# 🛡️ DigitalPlat 域名自动续期

**自动检查 DigitalPlat 免费域名(.dpdns.org),到期前 120 天内自动免费续期一年 — 全程零费用、零人工。**

[![GitHub Actions](https://github.com/wantaiyu/dashboard/actions/workflows/renew.yml/badge.svg)](https://github.com/wantaiyu/dashboard/actions/workflows/renew.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## ✨ 特性

- ⏰ **每周自动检查** — GitHub Actions 定时任务(默认 UTC 03:17),也可手动触发
- 🎁 **免费续期** — 到期前 **120 天**进入续期窗口,自动"申请免费续期 **+1 年**",不花积分
- 🔑 **支持多账号** — `DIGITALPLAT_API_KEY` 一行一个 Key,自动合并检查并按各账号自己的 Key 续期
- 🛡️ **账号隔离** — 某个 Key 失效不影响其他账号继续续期,汇总里单独标出异常账号
- 📊 **表格化输出** — 账号/域名/状态/到期时间/剩余天数一目了然(步骤日志 + 运行页 Summary)
- 📧 **失败自动通知** — 任一步失败,GitHub Actions 发邮件提醒
- 🌐 **支持多域名** — 自动遍历每个账号下所有 DigitalPlat 域名

## 📊 运行效果

每次运行后,在 Actions 运行页的 **Summary** 标签即可直接查看(无需展开日志):

> **📋 DigitalPlat 域名检查 (2026-09-17 08:30:50)**
>
> 共 2 个账号 · 3 个域名 · 续期窗口: 到期前 120 天 · 每次续 1 年
>
> | 账号 | 域名 | 状态 | 到期时间 | 剩余天数 | 自动续 |
> | --- | --- | --- | --- | --- | --- |
> | #1 | example.dpdns.org | 窗口外 | 2027-02-23 | 159天 | 否 |
> | #1 | api.dpdns.org | 窗口内 | 2026-12-01 | 75天 | 否 |
> | #2 | blog.dpdns.org | 窗口外 | 2027-05-29 | 254天 | 否 |
>
> **自动续期明细** — ✅ #1 api.dpdns.org 续期成功 +1 年(示例)

- `窗口外` = 剩余天数 > 120,暂无需续期
- `窗口内` = 剩余天数 ≤ 120,将自动免费续期
- `永久有效` = 接口未返回到期时间

## 🔧 工作原理

```
GitHub Actions (cron 每周 03:17 UTC)
        │
        ▼
按账号逐个 GET /api/v1/domains ──► 解析每个域名: 到期时间(expires_at)
        │                           状态(slot_type / domain_kind)
        ▼
生成检查表格: 账号 / 状态 = 窗口外 / 窗口内 / 永久有效
        │
        ▼
有域名进入"窗口内"(≤120天)?
        │
    ┌───┴───┐
   否        是
    │         │
    ▼         ▼
 无事发生   POST /api/v1/domains/{domain}/renew
            (用该域名所属账号的 Key;免费域名 payment=free)
        │
        ▼
  把结果写入 Job Summary + 步骤日志(失败则退出码 1 触发邮件)
```

## 🚀 快速开始

### 第 1 步:获取 DigitalPlat API Key

1. 登录 [DigitalPlat Dashboard](https://dashboard.digitalplat.org) → **API Keys**(`/dashboard/api/keys`)
2. 创建 API Key,并授予 **Domains(域名)** 相关权限
3. 复制生成的 key(`dp_live_...`)

> ⚠️ 原始 key **只显示一次**,请立即保存。服务端仅存储 SHA256 哈希,丢失只能重新生成。

### 第 2 步:配置 Secret

在仓库 **Settings → Secrets and variables → Actions** 新建:

| Name | Value |
| --- | --- |
| `DIGITALPLAT_API_KEY` | 单个账号:`dp_live_xxxxxxxxxxxxxxx`<br>多个账号:**一行一个 Key**(多行文本) |

> 多账号示例(Secret 里直接粘贴多行,每行一个账号的 Key):
>
> ```
> dp_live_aaaaaaaaaaaaaaa
> dp_live_bbbbbbbbbbbbbbb
> ```
>
> 空行会被忽略;重复 Key 只处理一次;也兼容英文逗号分隔。

### 第 3 步:手动验证一次

**Actions → digitalplat-renew → Run workflow**,打开运行页:

- **Summary** 标签:直接看到域名检查表格
- 「列出域名」步骤日志:同款纯文本表格
- 确认 3 个域名状态显示正常后即可

之后每周自动运行,不用再管。

## ⚙️ 配置(全部内置默认,一般不用改)

| 项 | 默认值 | 环境变量覆盖 |
| --- | --- | --- |
| 续期窗口 | **120 天** | `RENEW_THRESHOLD_DAYS` |
| 每次续期 | **1 年** | `RENEW_YEARS` |
| 免费域名支付方式 | **`free`**(免费) | `RENEW_PAYMENT_FREE` |
| 其他域名支付方式 | **`credits`** | `RENEW_PAYMENT_PAID` |
| 统一指定支付方式 | 空(自动按类型) | `RENEW_PAYMENT_METHOD` |
| 请求间隔 | **300 ms** | `RENEW_DELAY_MS` |
| 预览模式 | 关(直接续期) | `DRY_RUN=true` 或 `--dry-run` |
| API 地址 | `https://domain-api.digitalplat.org/api/v1` | `DIGITALPLAT_BASE_URL` |

## 🖥️ 本地运行

```powershell
# PowerShell(单账号)
$env:DIGITALPLAT_API_KEY = "dp_live_xxx"

# PowerShell(多账号:反引号 `n 表示换行,一行一个 Key)
$env:DIGITALPLAT_API_KEY = "dp_live_aaa`ndp_live_bbb"

node scripts/list-domains.mjs            # 只看检查表格
node scripts/renew.mjs --dry-run         # 预览:哪些会进入续期窗口(不发续期请求)
node scripts/renew.mjs                   # 真实运行
node scripts/renew.mjs --json            # 附带打印接口完整原始响应(排查用)
```

```bash
# Linux / macOS
export DIGITALPLAT_API_KEY="dp_live_xxx"                   # 单账号
export DIGITALPLAT_API_KEY=$'dp_live_aaa\ndp_live_bbb'     # 多账号:一行一个
node scripts/renew.mjs
```

## 📁 项目结构

```
.
├── .github/workflows/renew.yml   # GitHub Actions 定时任务(每周 03:17 UTC)
├── scripts/
│   ├── renew.mjs                 # 主脚本:检查 + 自动续期(零依赖,Node 18+)
│   ├── list-domains.mjs          # 辅助:只打印域名检查表格
│   └── keys.mjs                  # 共用:解析多账号 API Key(一行一个)
├── .env.example                  # 本地运行示例
└── README.md
```

## ❓ 常见问题

**Q:为什么状态是"窗口外"还要每天跑?**
每天跑是为了让"剩余天数"始终准确,且到 120 天窗口那一刻**自动**续期,不需要你记得去点。

**Q:续期要花积分吗?**
不用。免费域名在窗口内走 `payment=free`,免费续 1 年;只有**窗口外提前续期**才用积分(如 `1 year $3`),脚本默认不会触发。

**Q:显示"永久有效"是怎么回事?**
接口未返回 `expires_at`(到期时间)时会显示"永久有效"。正常域名都会返回真实到期日。

**Q:账户里多个域名都能自动续吗?**
能。脚本遍历账号下**所有**域名,每个到期前 120 天都会自动续期。

**Q:有多个 DigitalPlat 账号怎么办?**
把每个账号的 Key 各占一行写进同一个 `DIGITALPLAT_API_KEY`(Actions Secret 支持多行文本),脚本会逐账号拉取域名,并用**该域名所属账号的 Key** 续期。某个 Key 失效只会把该账号标记为异常,其他账号照常续期(整体退出码仍为 1,便于邮件通知)。

**Q:运行有 1 个 warning 正常吗?**
正常,是 GitHub 提示 `actions/checkout@v4` 基于的 Node 20 即将弃用,不影响运行。

## 🔒 安全

- API Key 只存在于 **GitHub Actions Secrets**,绝不写入代码或提交到仓库
- 脚本只读域名列表 + 调用续期,**不会**删除域名或修改 DNS
- 本仓库为公开仓库,也请勿在 Issue / Commit 中粘贴任何 key

## 📄 License

[MIT](LICENSE)
