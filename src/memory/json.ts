// src/memory/json.ts
// 从 LLM 输出中稳健地提取 JSON。
//
// 参考实现用的是 content.match(/\{[\s\S]*\}/)：贪婪匹配到最后一个 `}`，
// 遇到嵌套对象、markdown 围栏或尾逗号就会抛异常。这里用栈匹配 + 修复重试。

/** 去掉 markdown 代码围栏与尾逗号 */
export function repairJson(raw: string): string {
  return raw
    .replace(/```(?:json)?/gi, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

/**
 * 提取文本中所有括号配平的 JSON 对象。
 * 会跳过字符串内部的 `{` `}`，并处理转义引号。
 */
export function extractJsonObjects(text: string): string[] {
  const result: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      if (depth > 0) {
        depth--
        if (depth === 0 && start >= 0) {
          result.push(text.slice(start, i + 1))
          start = -1
        }
      }
    }
  }
  return result
}

/**
 * 尽量把 LLM 返回解析成对象。
 * 依次尝试：整体解析 → 提取出的对象（从后往前，后面通常是最终答案）→ 修复后解析。
 */
export function parseLlmJson<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null

  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const candidates = [cleaned, ...[...extractJsonObjects(cleaned)].reverse()]

  for (const candidate of candidates) {
    for (const attempt of [candidate, repairJson(candidate)]) {
      if (!attempt) continue
      try {
        const parsed = JSON.parse(attempt)
        if (parsed && typeof parsed === 'object') return parsed as T
      } catch {
        // 继续尝试下一个候选
      }
    }
  }
  return null
}
