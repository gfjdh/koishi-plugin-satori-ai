/**
 * 一碰一评估函数的训练权重（由 scripts/train-onetouch.ts 生成）。
 *
 * 数组长度必须等于 oneTouchEngine 的 FEATURE_COUNT（73）。
 * 留空或维度不符时，gameOneTouch 会回退到 handcraftedWeights()（等价于旧评估）。
 *
 * 本次权重：mode=regret，训练难度 2–8，500 个局面，20 世代 CEM，教师=旧手调评估
 * （深 3 层），起点=带一步战术特征的 tacticalWeights，冻结 40 维手牌 one-hot。
 *
 * 独立校验（成对自对弈：同一组初始手牌打两局、交换先后手，深度=round(难度/2)，
 * 每级 150 组手牌，与旧评估对局）：
 *   2–10 级合计 1420 胜 / 1177 负 / 103 平 = 54.7%（平局按 0.5 计 54.5%）。
 *   分级胜率：2 级 58.2%，3 级 54.1%，4 级 56.8%，5 级 52.9%，6 级 55.7%，
 *   7 级 53.3%，8 级 54.1%，9 级 54.4%，10 级 52.5%。
 *
 * 重新训练后覆盖本文件即可：
 *   ../../node_modules/.bin/tsx scripts/train-onetouch.ts --mode regret
 * 训练产出 JSON 的 weights 数组直接替换下面的数字。
 */
export declare const ONETOUCH_EVAL_WEIGHTS: number[];
