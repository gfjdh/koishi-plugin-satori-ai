/** 去掉 markdown 代码围栏与尾逗号 */
export declare function repairJson(raw: string): string;
/**
 * 提取文本中所有括号配平的 JSON 对象。
 * 会跳过字符串内部的 `{` `}`，并处理转义引号。
 */
export declare function extractJsonObjects(text: string): string[];
/**
 * 尽量把 LLM 返回解析成对象。
 * 依次尝试：整体解析 → 提取出的对象（从后往前，后面通常是最终答案）→ 修复后解析。
 */
export declare function parseLlmJson<T = any>(raw: string): T | null;
