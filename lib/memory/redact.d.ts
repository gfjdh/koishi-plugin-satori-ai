/** 依次替换；规则里的正则带 /g，必须直接用 replace（test 会留下 lastIndex 状态） */
export declare function redactSensitiveText(text: string): string;
