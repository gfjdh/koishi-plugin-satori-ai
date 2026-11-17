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
}
export declare function matchCharacters(description: string, topN?: number): CharacterMatch[];
/** 注入主模型提示词的候选说明 */
export declare function buildCharacterNote(matches: CharacterMatch[]): string;
