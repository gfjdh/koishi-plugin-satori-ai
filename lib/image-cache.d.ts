import { Session } from 'koishi';
import { CollectedImage } from './vision';
/** 上一条纯图片消息的有效期：超过就不算「紧接着的」 */
export declare const IMAGE_CACHE_TTL_MS = 60000;
/** 记录一条纯图片消息，供该用户在这个频道的下一条消息使用 */
export declare function rememberImageMessage(session: Session, images: CollectedImage[], now?: number): void;
/** 这个用户发了别的消息，上一条纯图片不再算「上一条」 */
export declare function forgetImageMessage(session: Session): void;
/** 取出 60 秒内上一条纯图片消息的图片；取出后即失效 */
export declare function takeRecentImageMessage(session: Session, now?: number): CollectedImage[];
/** 测试用：清空缓存 */
export declare function clearImageCache(): void;
