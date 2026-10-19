// src/memory/reject.ts
// 模型侧内容审核拒绝的识别。归档链路（summarizer）和画像链路（profile）
// 都要用，单独放一个模块，避免 profile 反向引用 summarizer 造成循环依赖。

/** 内容审核拒绝：同一段文本再发一次没有意义，只能跳过或脱敏后重试 */
export function isRejectedContent(message?: string): boolean {
  if (!message) return false
  return /data_inspection_failed|inappropriate content|内容审核|违规/i.test(message)
}