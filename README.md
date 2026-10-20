<div align="center">

# 🛡️ 免费域名自动续期(DigitalPlat + DNSHE)

**自动检查 DigitalPlat(.dpdns.org 等)与 DNSHE 免费域名,进入续期窗口后自动免费续期一年 — 全程零费用、零人工。**

[![GitHub Actions](https://github.com/haixing1001/dpdns-renew/actions/workflows/renew.yml/badge.svg)](https://github.com/haixing1001/dpdns-renew/actions/workflows/renew.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## ✨ 特性

- ⏰ **每周自动检查** — GitHub Actions 定时任务(默认 UTC 03:17),也可手动触发
- 🎁 **免费续期** — 进入各平台官方续期窗口后自动续期一年,不花积分/余额
- 🔑 **多平台多账号** — DigitalPlat 一行一个 API Key;DNSHE 一行一组 Key+Secret,自动合并检查
- 🛡️ **账号隔离** — 某个凭据失效不影响其他账号继续续期,汇总里单独标出异常账号
- 📊 **表格化输出** — 平台/账号/域名/状态/到期时间/剩余天数一目了然(步骤日志 + 运行页 Summary)
- 📧 **失败自动通知** — 任一步失败,GitHub Actions 发邮件提醒
- 🌐 **支持多域名** — 自动遍历每个账号下所有域名(分页拉全)

## 📊 运行效果

每次运行后,在 Actions 运行页的 **Summary** 标签即可直接查看(无需展开日志):

> **📋 域名检查 (2026-09-17 08:30:50)**
>
> 共 2 个平台 · 3 个账号 · 4 个域名 · 续期窗口: DigitalPlat 120 天 / DNSHE 180 天
>
> | 平台 | 账号 | 域名 | 状态 | 到期时间 | 剩余天数 | 自动续 |
> | --- | --- | --- | --- | --- | --- | --- |
> | DigitalPlat | #1 | example.dpdns.org | 窗口外 | 2027-02-23 | 159天 | 否 |
> | DigitalPlat | #1 | api.dpdns.org | 窗口内 | 2026-12-01 | 75天 | 否 |
> | DigitalPlat | #2 | blog.dpdns.org | 窗口外 | 2027-05-29 | 254天 | 否 |
> | DNSHE | #1 | atxsz.de5.net | 窗口外 | 2027-07-24 | 277天 | — |
>
> **自动续期明细** — ✅ DigitalPlat #1 api.dpdns.org 续期成功 +1 年(示例)

- `窗口外` = 未进入续期窗口,暂无需续期
- `窗口内` = 已进入续期窗口( DigitalPlat 120 天 / DNSHE 180 天),将自动免费续期
- `永久有效` = 接口未返回到期时间

## 🔧 工作原理

```
GitHub Actions (cron 每周 03:17 UTC)
        │
        ▼
按账号逐个拉取域名列表
  ├─ DigitalPlat: GET  /api/v1/domains              (Bearer Key)
  └─ DNSHE:       GET  ...&endpoint=subdomains&action=list (X-API-Key/Secret,自动翻页)
        │
        ▼
生成检查表格: 平台 / 账号 / 状态 = 窗口外 / 窗口内 / 永久有效
        │
        ▼
有域名进入"窗口内"?
        │
    ┌───┴───┐
   否        是
    │         │
    ▼         ▼
 无事发生   DigitalPlat: POST /api/v1/domains/{domain}/renew (payment=free)
            DNSHE:       POST ...&endpoint=subdomains&action=renew {subdomain_id}
            (各自用该域名所属账号的凭据;窗口未开启时记为"跳过"不算失败)
        │
        ▼
  把结果写入 Job Summary + 步骤日志(失败则退出码 1 触发邮件)
```

## 🚀 快速开始

### 第 1 步:获取 API 凭据

**DigitalPlat**

1. 登录 [DigitalPlat Dashboard](https://dashboard.digitalplat.org) → **API Keys**(`/dashboard/api/keys`)
2. 创建 API Key,并授予 **Domains(域名)** 相关权限
3. 复制生成的 key(`dp_live_...`)

**DNSHE**

1. 登录 [DNSHE 控制台](https://my.dnshe.com) → 域名页面 → **API 管理**
2. 创建密钥,保存 **API Key**(`cfsd_...`)与 **API Secret**
3. 参考官方文档:[DNSHE 免费域名 API 使用文档 V2.0](https://my.dnshe.com/knowledgebase/13/DNSHE-Free-Domain-API-User-Guide-V2.0.html)

> ⚠️ 两边的密钥都**只显示一次**,请立即保存。

### 第 2 步:配置 Secret

在仓库 **Settings → Secrets and variables → Actions** 新建(只用一个平台时,另一个平台留空即可):

| Name | Value |
| --- | --- |
| `DIGITALPLAT_API_KEY` | 单个账号:`dp_live_xxx`<br>多个账号:**一行一个 Key**(多行文本) |
| `DNSHE_API_KEY` | 单个账号:`cfsd_xxx`<br>多个账号:**一行一个**(多行文本) |
| `DNSHE_API_SECRET` | 与 `DNSHE_API_KEY` **逐行对应**的 Secret |

> 多账号示例(DigitalPlat):
>
> ```
> dp_live_aaaaaaaaaaaaaaa
> dp_live_bbbbbbbbbbbbbbb
> ```
>
> DNSHE 多账号时两个变量都写成多行,第 N 行 Key 配第 N 行 Secret。空行会被忽略;重复条目只处理一次。

### 第 3 步:手动验证一次

**Actions → domain-renew → Run workflow**,打开运行页:

- **Summary** 标签:直接看到域名检查表格(含平台/账号列)
- 「列出域名」步骤日志:同款纯文本表格
- 确认域名状态显示正常后即可

之后每周自动运行,不用再管。

## ⚙️ 配置(全部内置默认,一般不用改)

| 项 | 默认值 | 环境变量覆盖 |
| --- | --- | --- |
| DigitalPlat 续期窗口 | **120 天** | `RENEW_THRESHOLD_DAYS` |
| DNSHE 续期窗口 | **180 天**(官方) | `DNSHE_RENEW_THRESHOLD_DAYS` |
| 每次续期 | **1 年** | `RENEW_YEARS` |
| 免费域名支付方式(DigitalPlat) | **`free`**(免费) | `RENEW_PAYMENT_FREE` |
| 其他域名支付方式(DigitalPlat) | **`credits`** | `RENEW_PAYMENT_PAID` |
| 统一指定支付方式 | 空(自动按类型) | `RENEW_PAYMENT_METHOD` |
| 请求间隔 | **300 ms** | `RENEW_DELAY_MS` |
| 预览模式 | 关(直接续期) | `DRY_RUN=true` 或 `--dry-run` |
| DigitalPlat API 地址 | `https://domain-api.digitalplat.org/api/v1` | `DIGITALPLAT_BASE_URL` |
| DNSHE API 地址 | `https://api005.dnshe.com/index.php` | `DNSHE_BASE_URL` |

## 🖥️ 本地运行

```powershell
# PowerShell(单账号)
$env:DIGITALPLAT_API_KEY = "dp_live_xxx"

# PowerShell(多账号:反引号 `n 表示换行,一行一个 Key)
$env:DIGITALPLAT_API_KEY = "dp_live_aaa`ndp_live_bbb"

# DNSHE(单个账号)
$env:DNSHE_API_KEY = "cfsd_xxx"
$env:DNSHE_API_SECRET = "yyyy"

node scripts/list-domains.mjs            # 只看检查表格
node scripts/renew.mjs --dry-run         # 预览:哪些会进入续期窗口(不发续期请求)
node scripts/renew.mjs                   # 真实运行
node scripts/renew.mjs --json            # 附带打印接口完整原始响应(排查用)
```

```bash
# Linux / macOS
export DIGITALPLAT_API_KEY="dp_live_xxx"                   # 单账号
export DIGITALPLAT_API_KEY=$'dp_live_aaa\ndp_live_bbb'     # 多账号:一行一个
export DNSHE_API_KEY="cfsd_xxx" DNSHE_API_SECRET="yyyy"    # DNSHE
node scripts/renew.mjs
```

## 📁 项目结构

```
.
├── .github/workflows/renew.yml   # GitHub Actions 定时任务(每周 03:17 UTC)
├── scripts/
│   ├── renew.mjs                 # 主脚本:检查 + 自动续期(零依赖,Node 18+)
│   ├── list-domains.mjs          # 辅助:只打印域名检查表格
│   ├── accounts.mjs              # 账号编排:环境变量 → 统一账号列表
│   ├── digitalplat.mjs           # DigitalPlat API 客户端
│   ├── dnshe.mjs                 # DNSHE API 客户端(V2.0)
│   └── keys.mjs                  # 共用:解析多账号 API Key(一行一个)
├── .env.example                  # 本地运行示例
└── README.md
```

## ❓ 常见问题

**Q:为什么状态是"窗口外"还要每周跑?**
每周跑是为了让"剩余天数"始终准确,且到续期窗口那一刻**自动**续期,不需要你记得去点。

**Q:续期要花钱吗?**
不用。DigitalPlat 免费域名在窗口内走 `payment=free`;DNSHE 续期返回的 `charged_amount` 为 0。两者都是免费续 1 年。

**Q:显示"永久有效"是怎么回事?**
接口未返回到期时间(DNSHE 还会返回 `never_expires=1`)时会显示"永久有效"。

**Q:有多个账号怎么办?**
DigitalPlat 把每个 Key 各占一行写进 `DIGITALPLAT_API_KEY`;DNSHE 把 Key 和 Secret 都写成多行、按行对应。脚本逐账号拉取域名,并用**该域名所属账号的凭据**续期。某个凭据失效只会把该账号标记为异常,其他账号照常续期(整体退出码仍为 1,便于邮件通知)。

**Q:两个平台都必须配置吗?**
不必。只配置一个平台就只处理那一个;两个都配就一起处理,表格里会多出"平台"列。

**Q:运行有 1 个 warning 正常吗?**
正常,是 GitHub 提示 `actions/checkout@v4` 基于的 Node 20 即将弃用,不影响运行。

## 🔒 安全

- API 凭据只存在于 **GitHub Actions Secrets**,绝不写入代码或提交到仓库
- 脚本只读域名列表 + 调用续期,**不会**删除域名或修改 DNS 记录
- 本仓库为公开仓库,也请勿在 Issue / Commit 中粘贴任何密钥

## 📄 License

[MIT](LICENSE)
