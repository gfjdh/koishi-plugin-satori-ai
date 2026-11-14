// src/memory/text.ts
// 归档输入共用的文本整形。

/**
 * 压成一行：换行会让用户伪造出新的发言人行，归档只需要语义，不需要原排版。
 */
export function oneLine(content: string): string {
  return (content || '').replace(/\s*\r?\n\s*/g, ' ').trim()
}
