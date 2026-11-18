export interface TouhouCharacter {
    name: string;
    alias: string[];
    appearance: string;
}
/** 角色库文件名，位于插件配置的 dataDir 下 */
export declare const TOUHOU_CHARACTERS_FILE = "touhou_characters.json";
/** 低于这个分数说明描述里没有足够的角色特征词，宁可不给候选 */
export declare const CHARACTER_MATCH_MIN_SCORE = 15;
/**
 * 命中的多字查询词数量。BM25 的绝对值依赖语料规模：用户自定义成很小的角色库时，
 * 分数整体偏低，用命中词数兜底（默认 176 个角色时，相关描述命中 8~14 个，无关描述 2 个）。
 */
export declare const CHARACTER_MATCH_MIN_TOKENS = 6;
/** 候选说明里每个角色最多带多少字的外观摘要 */
export declare const CHARACTER_SUMMARY_MAX_CHARS = 80;
/** 用户正文参与角色检索的最大长度：太长会把外观特征稀释掉 */
export declare const MATCH_QUERY_USER_TEXT_MAX = 200;
/**
 * 从角色库的外观长文里压出一行摘要（发/瞳/标志物），给主模型核对用。
 * 官方外观里写着瞳色和第三只眼这类信息，主模型据此判断比凭记忆可靠。
 */
export declare function summarizeAppearance(appearance: string, name?: string): string;
/**
 * 启动时加载角色库：文件不存在就写一份默认值，存在则按用户的版本加载。
 * 解析失败或内容为空时退回内置默认值，不覆盖用户文件。
 */
export declare function loadTouhouCharacters(dataDir: string): TouhouCharacter[];
export declare function getTouhouCharacters(): TouhouCharacter[];
export interface CharacterMatch {
    name: string;
    aliases: string[];
    score: number;
    /** 官方外观摘要（发/瞳/标志物），供主模型核对；没有资料时为空串 */
    summary: string;
}
export declare function matchCharacters(description: string, topN?: number): CharacterMatch[];
/** 识图描述里的「特征」行；模型没按格式输出时返回空串 */
export declare function extractFeatureLines(description: string): string;
/**
 * 角色检索的查询：特征行 + 用户正文。
 * 整段描述里的动作、背景、衣服上的字母等词会稀释外观特征，所以只取特征行；
 * 用户在正文里点名的角色（如「看这个恋恋」）是最强先验，必须一起参与检索。
 */
export declare function buildMatchQuery(description: string, userText?: string): string;
/** 注入主模型提示词的候选说明：带上官方外观摘要，供模型与图中描述核对 */
export declare function buildCharacterNote(matches: CharacterMatch[]): string;
