// 独立校验脚本：复刻 main.ts 中的模板引擎逻辑，验证验收示例。
// 用法：node verify.js
// 说明：本脚本不含 Obsidian 依赖，仅用于离线验证转换算法是否正确。

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeOutputFormat(raw) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/<\\n>/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseTemplate(source) {
  const inputMatch = source.match(/<input>([\s\S]*?)<\/input>/);
  const outputMatch = source.match(/<output>([\s\S]*?)<\/output>/);
  if (!inputMatch || !outputMatch) return null;
  return {
    inputPattern: inputMatch[1].replace(/[\r\n]+/g, "").trim(),
    outputFormat: normalizeOutputFormat(outputMatch[1]),
  };
}

function parsePattern(pattern) {
  if (/%\d/.test(pattern)) {
    let reStr = "";
    for (const token of pattern.split(/(%\d+)/)) {
      if (token === "") continue;
      if (/^%\d+$/.test(token)) reStr += "(.*?)";
      else reStr += escapeRegExp(token);
    }
    return { regex: new RegExp("^" + reStr + "$") };
  }
  try {
    return { regex: new RegExp("^" + pattern + "$") };
  } catch (e) {
    throw new Error("正则表达式无效：" + e.message);
  }
}

function renderOutput(format, captures) {
  return format.replace(/%(\d+)/g, (whole, numStr) => {
    const n = parseInt(numStr, 10);
    return n >= 1 && n <= captures.length ? captures[n - 1] : whole;
  });
}

function applyTemplate(source, input) {
  const parsed = parseTemplate(source);
  if (!parsed) return { ok: false, result: "", error: "缺少 <input> 或 <output>" };
  let pattern;
  try {
    pattern = parsePattern(parsed.inputPattern);
  } catch (e) {
    return { ok: false, result: "", error: e.message };
  }
  const results = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    const m = pattern.regex.exec(line);
    if (m) results.push(renderOutput(parsed.outputFormat, m.slice(1)));
    else results.push(line);
  }
  return { ok: true, result: results.join("\n") };
}

function assert(name, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) {
    console.log("--- 实际输出 ---");
    console.log(JSON.stringify(actual));
    console.log("--- 期望输出 ---");
    console.log(JSON.stringify(expected));
  }
  return pass;
}

// ---- 示例 1（修正版模板，去掉 %1 与 %2 之间多余的逗号） ----
const tpl1 = `<input>
- %1 and %2
</input>

<output>
Please deep think, %1 and %2
<\\n>===
</output>`;

const input1 = `- apple, and banana
- banana, and fish
- d and e`;

const expected1 = `Please deep think, apple, and banana
===
Please deep think, banana, and fish
===
Please deep think, d and e
===`;

// ---- 示例 2（原始模板即可） ----
const tpl2 = `<input>
- %1---%2
</input>

<output>
%1
<\\n>---
%2
<\\n>===
</output>`;

const input2 = `- 描述客观真理的时候动词用什么形式---原型do`;

const expected2 = `描述客观真理的时候动词用什么形式
---
原型do
===`;

// ---- 示例 3：正则模式（输入不含 %N，直接写正则捕获组） ----
const tpl3 = `<input>
- ([A-Za-z]+)-([0-9]+)
</input>

<output>
%1 = %2
</output>`;

const input3 = `- apple-42
- banana-7`;

const expected3 = `apple = 42
banana = 7`;

let ok = true;
ok = assert("示例1（修正模板）", applyTemplate(tpl1, input1).result, expected1) && ok;
ok = assert("示例2", applyTemplate(tpl2, input2).result, expected2) && ok;
ok = assert("示例3（正则模式）", applyTemplate(tpl3, input3).result, expected3) && ok;

// ---- 额外说明：需求原文中的示例1模板多了一个逗号 ----
const tpl1Original = `<input>
- %1 and %2
</input>

<output>
Please deep think, %1, and %2
<\\n>===
</output>`;
console.log("\n提示：若严格使用需求原文的示例1输出模板（%1 后带逗号），结果会是：");
console.log(JSON.stringify(applyTemplate(tpl1Original, input1).result));

process.exit(ok ? 0 : 1);
