import { Context, segment, Element, Session, Next, Fragment } from 'koishi';
import { Sat } from './type';
type ChatCallback = (session: Session, session_of_id: Sat.Msg[]) => Promise<string>;
declare module 'koishi' {
    interface Context {
        sat: SAt;
    }
    interface Tables {
        p_system: p_system;
    }
}
export interface p_system {
    id: number;
    userid: string;
    usersname: string;
    p: number;
    time: Date;
    favorability: number;
}
declare class SAt extends Sat {
    pluginConfig: Sat.Config;
    channelDialogues: {
        [channelId: string]: Sat.Msg[];
    };
    constructor(ctx: Context, config: Sat.Config);
    /**
     *
     * @param session 会话
     * @param prompt 会话内容
     * @returns Promise<string | Element>
     */
    sat(session: Session, prompt: string): Promise<string | Element | void>;
    /**
     *
     * @param session 当前会话
     * @param next 通过函数
     * @returns 消息
     */
    middleware(session: Session, next: Next): Promise<string | string[] | segment | void | Fragment>;
    /**
     *
     * @param message 发送给chatgpt的json列表
     * @returns 将返回文字处理成json
     */
    chat_with_gpt(_session: Session, message: Sat.Msg[]): Promise<string>;
    /**
     *
     * @param sessionid QQ号
     * @returns 对应QQ的会话
     */
    get_chat_session(sessionid: string): Sat.Msg[];
    /**
     *
     * @param msg prompt消息
     * @param sessionid QQ号
     * @returns json消息
     */
    chat(msg: string, sessionid: string, session: Session): Promise<string | segment>;
    /**
     *
     * @param cb chat 回调函数 chat_with_gpt
     * @param session 会话
     * @param session_of_id 会话 ID
     * @returns
     */
    try_control(cb: ChatCallback, session: Session, session_of_id: Sat.Msg[]): Promise<any>;
    /**
     *
     * @param userId 用户QQ号
     * @param resp gpt返回的json
     * @returns 文字，图片或聊天记录
     */
    getContent(userId: string, resp: Sat.Msg[], messageId: string, botId: string): Promise<string | segment>;
    /**
     *
     * @param session 当前会话
     * @returns 返回清空的消息
     */
    clear(session: Session): string;
}
declare namespace SAt {
}
export default SAt;
