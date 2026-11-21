import { Context, Session } from 'koishi';
/** 单张图片的大小上限；超过就跳过，避免把内存和请求体撑爆 */
export declare const VISION_MAX_IMAGE_BYTES: number;
/** 一次最多处理多少张图（当前消息 + 引用消息合计） */
export declare const VISION_MAX_IMAGES = 6;
/**
 * Chronocat 的 /v1/assets 在媒体下载超过 1 秒时会返回 500，而第一次请求通常
 * 已经把媒体拉到了本地。重试几次就能命中缓存。
 */
export declare const IMAGE_DOWNLOAD_ATTEMPTS = 10;
export declare const IMAGE_DOWNLOAD_RETRY_DELAY_MS = 3000;
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
/**
 * 这张图值不值得下载。
 * 引用消息里只有解析出来的 img 标签，媒体本身取不到（Chronocat 的引用记录
 * 指向本地不存在的文件），重试十次也只是白等三十秒，直接按失败处理。
 */
export declare function isDownloadable(image: CollectedImage): boolean;
/** 从文件头猜 MIME；猜不出按 jpeg 处理，多数平台会自行识别 */
export declare function guessImageMime(buffer: Buffer): string;
/**
 * 把图片转成 data URL。
 * QQ 图片链接常带时效或平台鉴权，外部模型自己去抓经常失败，所以先下载再编码。
 * Satori 的 /v1/assets 接口需要 Bearer token，调用方应优先传 bot.http。
 */
export declare function downloadImageAsDataUrl(ctx: Context, src: string, http?: {
    get: (url: string, config?: any) => Promise<any>;
}, retryDelayMs?: number): Promise<string | null>;
/** 识图模型判定整张图违规时输出的标记，由系统拦截并丢弃整段描述 */
export declare const VISION_BLOCK_MARKER = "\u3010\u5185\u5BB9\u8FDD\u89C4\u3011";
/**
 * 图片没取全时给主模型的提示。
 *
 * 关键：只有一张图都没拿到时才能说「你看不到这张图」。部分图片失败时，
 * 已经识别出来的 [图片内容] 仍然有效；这时再说「看不到图」会让模型丢掉
 * 描述、转而从记忆里编名字（线上案例：黄仁勋的照片被答成群友「清水尚辉」，
 * 因为同一轮里上一张纯图片下载失败，触发了整段「图片无法识别」提示）。
 */
export declare function buildImageFailureNote(input: {
    total: number;
    used: number;
    quotedTotal: number;
    quotedUsed: number;
    censored?: boolean;
}): string;
/** 识图提示词：带上本消息正文，并要求重点描述与问题相关的部分 */
export declare function buildVisionPrompt(text: string, imageCount: number, quotedCount: number, previousCount?: number): string;
