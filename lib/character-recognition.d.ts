export interface CharacterProfile {
    name: string;
    alias: string[];
    appearance: string;
}
export interface CharacterData {
    version?: number;
    /** 旧版匹配词表；现在不再使用，读取时忽略 */
    vocabulary?: unknown;
    characters: unknown;
}
/** 角色库文件名，位于插件配置的 dataDir 下 */
export declare const CHARACTERS_FILE = "characters.json";
/** 旧文件名：启动时自动迁移，用户不用手工改名 */
export declare const LEGACY_CHARACTERS_FILE = "touhou_characters.json";
/** 官方外观摘要最多保留多少字 */
export declare const CHARACTER_SUMMARY_MAX_CHARS = 120;
/**
 * 启动时加载角色库：文件不存在就写一份默认值，存在则按用户的版本加载。
 * 兼容旧文件名 touhou_characters.json 和旧格式（纯角色数组）。
 * 解析失败或内容为空时退回内置默认值，不覆盖用户文件。
 */
export declare function loadCharacters(dataDir: string): CharacterProfile[];
export declare function getCharacters(): CharacterProfile[];
/**
 * 官方外观摘要：内置库是单行短档案，直接截断；
 * 旧格式/用户自定义的长文只取前几句，避免把整段百科塞进提示词。
 */
export declare function summarizeAppearance(appearance: string, name?: string): string;
/**
 * 把识图模型给的角色名归一化到角色库的正式名。
 * 匹配不到时原样返回：角色库之外的角色也应该能正常说出来。
 */
export declare function normalizeCharacterName(input: string): string;
/** 从识图描述里抽出模型给出的角色名（未归一化） */
export declare function extractIdentityNames(description: string): string[];
/** 角色库官方外观资料：只给库里确实存在的角色，作为核对参考，不生成候选 */
export declare function buildCharacterReference(names: string[]): string;
/** 在识图描述后面附上角色库资料；模型给的名字不在库里时不附加任何东西 */
export declare function applyCharacterReference(description: string): string;
