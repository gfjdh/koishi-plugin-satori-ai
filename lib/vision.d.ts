import { Context, Session } from 'koishi';
/** 单张图片的大小上限；超过就跳过，避免把内存和请求体撑爆 */
export declare const VISION_MAX_IMAGE_BYTES: number;
/** 一次最多处理多少张图（当前消息 + 引用消息合计） */
export declare const VISION_MAX_IMAGES = 6;
export interface CollectedImage {
    src: string;
    /** 来源：当前消息 / 被引用的消息 / 用户上一条纯图片消息 */
    source: 'current' | 'quoted' | 'previous';
}
/** 去掉图片、文件、@ 和裸链接后还有没有正文 */
export declare function hasTextContent(session: Session): boolean;
/** 本次消息自身的图片（不含引用消息） */
export declare function currentImages(session: Session): CollectedImage[];
/** 收集本次消息和被引用消息里的图片，保持出现顺序 */
export declare function collectImages(session: Session): CollectedImage[];
/** 去掉正文里的图片标签；图片本身交给识图或多模态，不留在文本里 */
export declare function stripImageTags(text: string): string;
/** 从文件头猜 MIME；猜不出按 jpeg 处理，多数平台会自行识别 */
export declare function guessImageMime(buffer: Buffer): string;
/**
 * 把图片转成 data URL。
 * QQ 图片链接常带时效或平台鉴权，外部模型自己去抓经常失败，所以先下载再编码。
 * Satori 的 /v1/assets 接口需要 Bearer token，调用方应优先传 bot.http。
 */
export declare function downloadImageAsDataUrl(ctx: Context, src: string, http?: {
    get: (url: string, config?: any) => Promise<any>;
}): Promise<string | null>;
/** 识图提示词：带上本消息正文，并要求重点描述与问题相关的部分 */
export declare function buildVisionPrompt(text: string, imageCount: number, quotedCount: number, previousCount?: number): string;
