export interface CharacterProfile {
    name: string;
    alias: string[];
    appearance: string;
}
/** 一个标志物的定义：同一件东西的多种写法（words 是字面词，patterns 是正则源码） */
export interface SignatureDef {
    name: string;
    words?: string[];
    patterns?: string[];
}
/**
 * 识别词表。全部放在 data/characters.json 的 vocabulary 节里，
 * 新增颜色、发型、配饰、标志物都只改 JSON，不改代码。
 */
export interface Vocabulary {
    /** 颜色字表和色系归并（金≈黄、银/灰≈白 等） */
    colors: {
        chars: string;
        families: Record<string, string[]>;
    };
    /** 发型词表 */
    styles: string[];
    /** 头部配饰词表 */
    accessories: string[];
    /** 服装词表 */
    clothing: string[];
    /** 同义写法归一（「喀秋莎头饰」→「女仆头饰」） */
    synonyms: {
        from: string;
        to: string;
    }[];
    /** 标志物词表：同义词组，命中独特标志可以弥补发色/服装被同人图改动 */
    signatures: SignatureDef[];
    /** 头部上下文正则源码：配饰出现在这些词附近才算头饰 */
    headContext: string;
}
export interface CharacterData {
    version?: number;
    vocabulary?: Partial<Vocabulary>;
    characters: unknown;
}
/** 角色库文件名，位于插件配置的 dataDir 下 */
export declare const CHARACTERS_FILE = "characters.json";
/** 旧文件名：启动时自动迁移，用户不用手工改名 */
export declare const LEGACY_CHARACTERS_FILE = "touhou_characters.json";
/**
 * 低于这个分数说明描述里没有足够的角色特征词，宁可不给候选。
 * 分数是「外观字段加分 + 0.25 × BM25」的混合值（见 matchCharacters）。
 */
export declare const CHARACTER_MATCH_MIN_SCORE = 10;
/**
 * 命中的多字查询词数量。BM25 的绝对值依赖语料规模：用户自定义成很小的角色库时，
 * 分数整体偏低，用命中词数兜底（默认 176 个角色时，相关描述命中 8~14 个，无关描述 2 个）。
 */
export declare const CHARACTER_MATCH_MIN_TOKENS = 6;
/**
 * 外观字段加分。多人合照里服装往往统一（泳装、校服），BM25 会被「深蓝色连体泳衣」
 * 这类词带偏；发色、瞳色、发型、头饰、标志物才是区分角色的可靠信号。
 */
export declare const HAIR_EXACT_BONUS = 6;
export declare const HAIR_FAMILY_BONUS = 3;
export declare const EYE_EXACT_BONUS = 3;
export declare const EYE_FAMILY_BONUS = 1.5;
/** 瞳色对不上只轻微扣分：识图模型对瞳色的判断经常不准 */
export declare const EYE_CONFLICT_PENALTY = 1;
export declare const STYLE_MATCH_BONUS = 2;
export declare const HEAD_ACCESSORY_BONUS = 4;
export declare const HEAD_ACCESSORY_COLOR_BONUS = 3;
export declare const HEAD_ACCESSORY_COLOR_MISMATCH_BONUS = 1;
export declare const CLOTHING_MATCH_BONUS = 2;
/** 用户正文里直接点名角色（别名）是最强先验 */
export declare const ALIAS_MATCH_BONUS = 5;
/** BM25 只作为弱信号参与：长百科正文里通用词太多，权重过高会压过外观字段 */
export declare const BM25_MIX_WEIGHT = 0.25;
/** 出现在不超过这么多个角色档案里的标志物算「独特标志」 */
export declare const SIGNATURE_RARE_MAX = 5;
/** 普通标志物命中加分 */
export declare const SIGNATURE_MATCH_BONUS = 3;
/** 独特标志物命中加分；独特标志还能绕过发色冲突（同人图常改发色） */
export declare const RARE_SIGNATURE_BONUS = 8;
/** 一次最多匹配多少个角色：漫画/多格图可能列出几十个，候选说明不能无限长 */
export declare const CHARACTER_MAX_GROUPS = 8;
/**
 * 组级最低线：每组第一候选低于这个分数就不给预选，让模型直接说认不出来。
 * 已知正确候选的实测最低分是 12.6，低于 12 的多是「发色/瞳色只对上一半」的弱匹配。
 */
export declare const CHARACTER_GROUP_MIN_SCORE = 12;
/** 候选说明里每个角色最多带多少字的外观摘要 */
export declare const CHARACTER_SUMMARY_MAX_CHARS = 120;
/** 用户正文参与角色检索的最大长度：太长会把外观特征稀释掉 */
export declare const MATCH_QUERY_USER_TEXT_MAX = 200;
/** 发色色系；没有提到发色时返回空集 */
export declare function hairColorFamilies(text: string): Set<string>;
/** 瞳色色系；没有提到瞳色时返回空集 */
export declare function eyeColorFamilies(text: string): Set<string>;
/** 发色/瞳色里写到的颜色字（未经色系归并），用于给颜色完全写对的候选加分 */
export declare function hairColorChars(text: string): Set<string>;
export declare function eyeColorChars(text: string): Set<string>;
/**
 * 从文本里找出命中的标志物：键是标志物名，值是原文里出现的写法。
 * 检索打分和「档案补词」脚本共用。
 */
export declare function findSignatures(text: string): Map<string, string[]>;
/**
 * 查询里的瞳色：按短句取，且只认带「瞳/眼」的短句。
 * 特征行用顿号分隔，整行取色会把发色、衣服颜色都算成瞳色。
 */
export declare function eyeColorCharsInQuery(text: string): Set<string>;
/**
 * 启动时加载角色库和词表：文件不存在就写一份默认值，存在则按用户的版本加载。
 * 兼容旧文件名 touhou_characters.json 和旧格式（纯角色数组）。
 * 解析失败或内容为空时退回内置默认值，不覆盖用户文件。
 */
export declare function loadCharacters(dataDir: string): CharacterProfile[];
export declare function getCharacters(): CharacterProfile[];
/** 当前生效的识别词表（只读用途，例如调试和脚本） */
export declare function getVocabulary(): Vocabulary;
export interface CharacterMatch {
    name: string;
    aliases: string[];
    score: number;
    /** 官方外观摘要（发/瞳/标志物），供主模型核对；没有资料时为空串 */
    summary: string;
}
/**
 * 从角色库的外观文本里取一行摘要（发/瞳/标志物），给主模型核对用。
 * 内置库已经是 40~100 字的识别档案（单行），直接用；
 * 旧格式/用户自定义的长篇外观仍走行挑选逻辑。
 */
export declare function summarizeAppearance(appearance: string, name?: string): string;
/**
 * 候选说明用的摘要：只保留发色、瞳色、头饰这类稳定特征。
 * 服装和道具在同人图里常被换掉（泳装、换装），留着反而让主模型觉得「对不上」。
 */
export declare function summarizeForMatch(appearance: string, name?: string): string;
/**
 * 检索候选角色。
 * `colorSource` 是取发色/瞳色的文本：多角色图按角色分别检索时传该角色自己的特征行，
 * 避免把一个角色的粉发和另一个角色的金发混在一起，导致发色对不上的角色也进候选。
 *
 * 打分是外观字段（发色/瞳色/发型/头饰/标志物/服装）+ 0.25 × BM25 的混合值：
 * 合照里服装往往统一，纯 BM25 会被「深蓝色连体泳衣」这类通用词带偏。
 */
export declare function matchCharacters(description: string, topN?: number, colorSource?: string): CharacterMatch[];
/** 识图描述里的「特征」行；模型没按格式输出时返回空串 */
export declare function extractFeatureLines(description: string): string;
/**
 * 每个角色的特征行（不含前缀）。
 * 单角色图是「特征：…」；多角色图按提示词要求写成「特征1：…」「特征2：…」，
 * 每个角色各占一行，检索时分别匹配，避免把两个角色的特征混在一起。
 * 模型常自行加上位置标注（「特征1（左）：」）或改用「角色1：」「人物1：」，一并接受；
 * 同一角色重复出现（漫画多格、模型复读）只保留第一次。
 */
export declare function extractFeatureGroups(description: string): string[];
/**
 * 角色检索的查询：特征行 + 用户正文。
 * 整段描述里的动作、背景、衣服上的字母等词会稀释外观特征，所以只取特征行；
 * 用户在正文里点名的角色（如「看这个恋恋」）是最强先验，必须一起参与检索。
 */
export declare function buildMatchQuery(description: string, userText?: string): string;
export interface CharacterCandidateGroup {
    /** 角色编号，用于多角色图的候选说明 */
    label: string;
    matches: CharacterMatch[];
}
/**
 * 多角色图按角色分别检索：每个「特征N」行单独匹配，候选按角色分组。
 * 没有特征行时退回整段描述（老格式描述仍然可用）。
 */
export declare function matchCharacterGroups(description: string, userText?: string, topN?: number): CharacterCandidateGroup[];
/** 注入主模型提示词的候选说明：带上官方外观摘要，供模型与图中描述核对 */
export declare function buildCharacterNote(matches: CharacterMatch[]): string;
/** 多角色图的候选说明：每个角色分开写，避免把候选安到错误的角色身上 */
export declare function buildCharacterNoteFromGroups(groups: CharacterCandidateGroup[]): string;
