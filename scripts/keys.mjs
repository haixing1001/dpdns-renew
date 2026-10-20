// DIGITALPLAT_API_KEY 解析(多账号共用)
//
// 规则:
//   - 一行一个 API Key(每个账号一行);也兼容英文逗号分隔
//   - 忽略空行、首尾空白;重复 Key 只保留第一个
//   - 每个 Key 必须以 dp_ 开头(dp_live_… / dp_test_…),否则视为配置错误
//
// 返回值:
//   keys       — 去重后的有效 Key 数组(顺序与配置一致)
//   invalid    — 无效条目 [{ index, reason }](index 从 1 开始,不包含 Key 内容,避免泄露到公开日志)
//   duplicates — 重复条目的序号数组
export function parseApiKeys(raw) {
  const entries = String(raw ?? '')
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keys = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  entries.forEach((key, i) => {
    const index = i + 1;
    if (!key.startsWith('dp_')) {
      invalid.push({ index, reason: '不以 dp_ 开头(应为 dp_live_… 或 dp_test_…)' });
      return;
    }
    if (seen.has(key)) {
      duplicates.push(index);
      return;
    }
    seen.add(key);
    keys.push(key);
  });

  return { keys, invalid, duplicates };
}
