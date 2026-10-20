import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'
import {
  SKILL_MAP,
  SkillEffect,
  PlayerState,
  playerStatus,
  ONE_TOUCH_SKILL_LIST,
  applySkillEffect,
  resolveCombo,
  buildEffectMessage,
  wrapInHTML,
} from './gameOneTouch'
import { winFlag } from './game'
import { getMentionedUser } from './utils'

const logger = new Logger('satori-game-onetouch-pvp')

const INVITE_TIMEOUT = 60 * 1000 // 邀请超时
const TURN_TIMEOUT = 60 * 1000 // 回合超时判负
const DEFAULT_HP = 60
const MIN_HP = 20
const MAX_HP = 200

type Hand = '左' | '右'
type Phase = 'waiting' | 'playing' | 'over'
type Outcome = number | 'draw' | 'cancel'

interface PvpPlayer {
  userId: string
  name: string
  state: PlayerState
  score: number // 已结算的表现分
  turnBonus: number // 本回合未结算的奖励
  multiplier: number
  comboStreak: number
}

function randomHand() {
  return Math.round(Math.random() * 8) + 1
}

// 昵称会进入消息与图片，去掉可能被当作元素/标签解析的字符
function cleanName(name: string | undefined, fallback: string): string {
  const value = String(name || fallback || '').replace(/[<>&]/g, '').trim().slice(0, 24)
  return value || fallback
}

function parseMaxHp(session: Session): number {
  const text = (session.elements || [])
    .filter((element) => element.type === 'text')
    .map((element) => String(element.attrs?.content ?? ''))
    .join(' ')
  const anchor = text.indexOf('一碰一')
  const tail = anchor >= 0 ? text.slice(anchor + 3) : text
  const match = tail.match(/\d+/)
  if (!match) return DEFAULT_HP
  return Math.min(MAX_HP, Math.max(MIN_HP, parseInt(match[0], 10)))
}

/**
 * 一碰一 1v1 对战单局。双方都是真人，bot 只负责结算规则。
 */
export class OneTouchPvpSingleGame extends abstractGameSingleGame {
  private ctx: Context
  private players: PvpPlayer[]
  private maxHp: number
  private turn: number = 0 // 当前行动方在 players 里的下标
  private phase: Phase = 'waiting'
  private inviteTimer: ReturnType<typeof setTimeout> | null = null
  private turnTimer: ReturnType<typeof setTimeout> | null = null
  private onFinish: () => void

  constructor(
    disposeListener: () => boolean,
    session: Session,
    ctx: Context,
    opponent: { id: string; name?: string },
    maxHp: number,
    onFinish: () => void,
  ) {
    super(disposeListener, session)
    this.ctx = ctx
    this.maxHp = maxHp
    this.onFinish = onFinish
    this.playerIDs = [session.userId, opponent.id]
    this.players = [
      this.createPlayer(session.userId, cleanName(session.username, session.userId)),
      this.createPlayer(opponent.id, cleanName(opponent.name, opponent.id)),
    ]
  }

  private createPlayer(userId: string, name: string): PvpPlayer {
    return {
      userId,
      name,
      state: this.initState(),
      score: 0,
      turnBonus: 0,
      multiplier: 1,
      comboStreak: 0,
    }
  }

  private initState(): PlayerState {
    return {
      left: randomHand(),
      right: randomHand(),
      hp: this.maxHp,
      shield: 0,
      strength: 0,
      bleed: 0,
      counterAttack: 0,
      vulnerablility: 0,
      status: playerStatus.Normal,
    }
  }

  public override async startGame(): Promise<string> {
    super.startGame()
    const [initiator, opponent] = this.players
    this.inviteTimer = setTimeout(() => {
      this.abort('邀请超时，对战已取消')
    }, INVITE_TIMEOUT)
    this.inviteTimer.unref?.()
    await this.session.send(
      `<at id="${opponent.userId}"/> ${initiator.name} 向你发起了「一碰一」对战！\n` +
      `双方血量：${this.maxHp}\n` +
      `60 秒内回复「接受」开始，回复「拒绝」取消。`,
    )
    logger.info(`${initiator.userId} 向 ${opponent.userId} 发起一碰一对战，血量 ${this.maxHp}`)
    return ''
  }

  public override async processInput(input: string, session?: Session): Promise<string> {
    const sender = session?.userId ?? this.session.userId
    const idx = this.players.findIndex((player) => player.userId === sender)
    if (idx < 0) return
    // 去掉 @ 元素，允许玩家带着 @bot 的呼叫做操作
    const text = (input || '').replace(/<at\b[^>]*\/?>/gi, '').trim()

    if (this.phase === 'waiting') {
      if (idx !== 1) return
      if (text === '接受' || text === '同意' || text === '开始') {
        await this.startBattle()
        return
      }
      if (text === '拒绝' || text === '取消') {
        await this.abort(`${this.players[1].name} 拒绝了邀请，对战取消`)
      }
      return
    }

    if (this.phase === 'over') return
    if (text === '游戏规则') return await this.render(this.rules)
    if (text === '技能列表') return await this.render(ONE_TOUCH_SKILL_LIST)

    const move = /^(左|右)\s+(左|右)$/.exec(text)
    if (idx !== this.turn) {
      if (move) return '还没轮到你，请等待对方行动'
      return
    }
    if (!move) return
    return await this.executeTurn(idx, move[1] as Hand, move[2] as Hand)
  }

  private async startBattle() {
    this.clearTimers()
    this.phase = 'playing'
    for (const player of this.players) {
      player.state = this.initState()
      player.score = 0
      player.turnBonus = 0
      player.multiplier = 1
      player.comboStreak = 0
    }
    this.turn = Math.round(Math.random())
    const first = this.players[this.turn]
    const body = [
      '⚔️ 对战开始！',
      `血量：双方各 ${this.maxHp}`,
      ...this.players.map((player) => `${player.name}：左${player.state.left} 右${player.state.right}`),
      `由 ${first.name} 先手。`,
      '输入「左 右」选择用哪只手碰对方哪只手，例如「左 右」= 用你的左手碰对方右手。',
      '发送「游戏规则」查看规则，发送「技能列表」查看技能，发送「结束游戏」认输。',
    ].join('\n')
    try {
      await this.session.send(await this.render(body))
    } finally {
      // 无论消息是否发送成功都要开始计时，避免整局卡死
      this.resetTurnTimer()
    }
  }

  // 渲染失败时退回纯文本，避免整局卡死
  private async render(text: string): Promise<string> {
    try {
      return await wrapInHTML(text)
    } catch (error) {
      logger.warn(`图片渲染失败，改用文本：${error}`)
      return text
    }
  }

  private async executeTurn(idx: number, handA: Hand, handB: Hand): Promise<string | undefined> {
    this.clearTurnTimer()
    const atk = this.players[idx]
    const def = this.players[1 - idx]
    if (atk.state.status === playerStatus.lastStunned) atk.state.status = playerStatus.Normal

    const selfValue = atk.state[handA === '左' ? 'left' : 'right']
    const enemyValue = def.state[handB === '左' ? 'left' : 'right']
    const sum = (selfValue + enemyValue) % 10
    // 与原版一致：改动的永远是“值等于所选数值”的那只手（双手同值时改左手）
    atk.state[selfValue === atk.state.left ? 'left' : 'right'] = sum

    let effect = SKILL_MAP[sum.toString()] || {}
    const combo = resolveCombo(atk.state.left, atk.state.right)
    const isCombo = !!combo
    if (combo) {
      atk.comboStreak++
      effect = { ...combo }
    } else {
      atk.comboStreak = 0
    }

    // 奖励必须在效果结算前计算（部分条件依赖结算前的护盾与状态）
    const attackerBonus = this.buildAttackerBonus(atk, def, effect, isCombo)
    const defenderBonus = this.buildDefenderBonus(def, atk, effect)
    const attackerGain = this.settleTurnBonus(atk)
    const defenderGain = this.settleTurnBonus(def)
    applySkillEffect(atk.state, def.state, effect, isCombo)

    // 切换回合；若下一位处于眩晕则自动跳过
    this.turn = 1 - idx
    const skipMessages: string[] = []
    let guard = 0
    while (this.players[this.turn].state.status === playerStatus.Stunned && guard++ < 2) {
      const skipped = this.players[this.turn]
      skipped.state.status = playerStatus.lastStunned
      applySkillEffect(skipped.state, this.players[1 - this.turn].state, {}, false)
      skipMessages.push(`${skipped.name} 处于眩晕状态，跳过本回合`)
      this.turn = 1 - this.turn
    }

    const detail = this.buildTurnText({
      atk,
      def,
      handA,
      handB,
      selfValue,
      enemyValue,
      sum,
      effect,
      isCombo,
      attackerBonus,
      defenderBonus,
      attackerGain,
      defenderGain,
      skipMessages,
    })

    const dead = this.players.map((player) => player.state.hp <= 0)
    if (dead[0] && dead[1]) {
      await this.finish('draw', '双方同归于尽！', detail)
      return
    }
    if (dead[0] || dead[1]) {
      const loserIdx = dead[0] ? 0 : 1
      await this.finish(1 - loserIdx, `${this.players[loserIdx].name} 倒下了！`, detail)
      return
    }

    this.resetTurnTimer()
    const next = this.players[this.turn]
    return `${await this.render(detail)}\n<at id="${next.userId}"/> 轮到你了`
  }

  private buildTurnText(args: {
    atk: PvpPlayer
    def: PvpPlayer
    handA: Hand
    handB: Hand
    selfValue: number
    enemyValue: number
    sum: number
    effect: SkillEffect
    isCombo: boolean
    attackerBonus: string[]
    defenderBonus: string[]
    attackerGain: number
    defenderGain: number
    skipMessages: string[]
  }): string {
    const { atk, def, handA, handB, selfValue, enemyValue, sum } = args
    const lines: string[] = []
    lines.push(`▶️ ${atk.name} 用${handA}手(${selfValue}) 碰 ${def.name} 的${handB}手(${enemyValue}) → ${sum}`)
    lines.push(buildEffectMessage(args.effect, args.isCombo, atk.state, def.state))
    if (args.attackerBonus.length) lines.push(`【${atk.name} 表现】${args.attackerBonus.join('；')}`)
    if (args.defenderBonus.length) lines.push(`【${def.name} 表现】${args.defenderBonus.join('；')}`)
    if (args.attackerGain || args.defenderGain)
      lines.push(`本回合得分：${atk.name} +${args.attackerGain}，${def.name} +${args.defenderGain}`)
    lines.push(...args.skipMessages)
    lines.push('')
    lines.push(this.formatStatus(atk))
    lines.push(this.formatStatus(def))
    lines.push('')
    lines.push(`表现分：${atk.name} ${atk.score} | ${def.name} ${def.score}`)
    return lines.join('\n')
  }

  private formatStatus(player: PvpPlayer): string {
    const state = player.state
    const width = 10
    const max = Math.max(this.maxHp, state.hp, 1)
    const filled = Math.max(0, Math.min(width, Math.ceil(state.hp / max * width)))
    const bar = `[${'■'.repeat(filled)}${'□'.repeat(width - filled)}]`
    const parts = [
      `${player.name}：左${state.left} 右${state.right}`,
      `❤️${bar} ${state.hp}HP`,
      `🛡️${state.shield}`,
      state.bleed ? `🩸×${state.bleed}` : '',
      state.strength ? `💪×${state.strength}` : '',
      state.counterAttack ? `🗡️×${state.counterAttack}` : '',
      state.vulnerablility ? `💔×${state.vulnerablility}` : '',
      state.status === playerStatus.Stunned ? '💫 眩晕' : '',
    ]
    return parts.filter(Boolean).join(' | ')
  }

  // ——— 表现分：攻击方 ———
  private buildAttackerBonus(self: PvpPlayer, enemy: PvpPlayer, effect: SkillEffect, isCombo: boolean): string[] {
    const msg: string[] = []
    const s = self.state
    const e = enemy.state

    if (isCombo) {
      self.turnBonus += 10
      msg.push('触发组合技 +10')
    }
    if ((effect.damage || 0) * (effect.damageTimes || 1) >= 20 && e.shield === 0) {
      const bonus = Math.round((effect.damage || 0) * (effect.damageTimes || 1) * 0.8)
      self.turnBonus += bonus
      msg.push(`沉重一击 +${bonus}`)
    }
    if ((effect.pierceDamage || 0) >= 15) {
      const bonus = Math.round(effect.pierceDamage * 0.5)
      self.turnBonus += bonus
      msg.push(`穿刺一击 +${bonus}`)
    }
    if ((effect.destroyShield || 0) >= Math.min(e.shield, 3) && e.shield > 1) {
      const bonus = Math.round(e.shield * 5)
      self.turnBonus += bonus
      msg.push(`快速破盾 +${bonus}`)
    }
    if ((effect.bleed || 0) + e.bleed > 9) {
      const bonus = Math.round(e.bleed)
      self.turnBonus += bonus
      msg.push(`流血打击 +${bonus}`)
    }
    if (effect.shield && (effect.shield || 0) + s.shield >= 5) {
      const bonus = Math.round(((effect.shield || 0) + s.shield) * 2)
      self.turnBonus += bonus
      msg.push(`强效护盾 +${bonus}`)
    }
    if ((effect.selfbleed || 0) < -2 && s.bleed > -effect.selfbleed) {
      const bonus = Math.round(s.bleed * 2)
      self.turnBonus += bonus
      msg.push(`关键治疗 +${bonus}`)
    }
    if ((effect.stun || (effect.weakStun && e.shield === 0)) && e.status === playerStatus.Normal && e.bleed > 5) {
      const bonus = Math.round(e.bleed * 2)
      self.turnBonus += bonus
      msg.push(`流血眩晕 +${bonus}`)
    }
    if ((effect.strengthChange || 0) < -1 && e.strength < 0) {
      const bonus = Math.round(effect.strengthChange * -5)
      self.turnBonus += bonus
      msg.push(`强效削弱 +${bonus}`)
    }
    if (e.counterAttack > 0 && !effect.damage && !effect.pierceDamage) {
      const bonus = Math.round(e.counterAttack)
      self.turnBonus += bonus
      msg.push(`反击规避 +${bonus}`)
    }
    if (s.hp < 10 && !s.shield && (effect.damage || effect.pierceDamage)) {
      const bonus = (10 - s.hp) * 2
      self.turnBonus += bonus
      msg.push(`濒死反击 +${bonus}`)
    }
    if (effect.revwersalOfStrength && s.strength <= e.strength - 5) {
      const bonus = Math.min((e.strength - s.strength) * 3, 100)
      self.turnBonus += bonus
      msg.push(`逆转大局 +${bonus}`)
    }
    if ((effect.damage || 0) + (effect.pierceDamage || 0) >= 10 && e.vulnerablility > 0) {
      const extra = e.vulnerablility * 0.1
      self.multiplier += extra
      msg.push(`易伤打击 本回合分数 +${Math.round(extra * 100)}%`)
    }
    if (effect.magnificentEnd && e.bleed > 1) {
      const factor = Math.max(1, Math.round(e.bleed * 1.5))
      self.multiplier *= factor
      self.score *= 2
      msg.push(`华丽收场 总分×2，本回合分数×${factor}`)
    }
    if (self.comboStreak >= 1) {
      self.multiplier += self.comboStreak / 5
      msg.push(`组合技连击${self.comboStreak}次 本回合分数 +${20 * self.comboStreak}%`)
    }
    return msg
  }

  // ——— 表现分：防守方（在对方回合里的反击/格挡） ———
  private buildDefenderBonus(self: PvpPlayer, attacker: PvpPlayer, effect: SkillEffect): string[] {
    const msg: string[] = []
    const s = self.state
    if ((effect.damage || effect.pierceDamage) && s.counterAttack > 0) {
      const bonus = Math.max(s.counterAttack + (s.strength || 0), 0)
      self.turnBonus += bonus
      msg.push(`反击 +${bonus}`)
    }
    if ((effect.damage || 0) > 12 && s.shield > 0) {
      const bonus = Math.round(effect.damage)
      self.turnBonus += bonus
      msg.push(`关键格挡 +${bonus}`)
    }
    if (s.shield > 0 && effect.damage && s.counterAttack > 0) {
      const bonus = Math.round(s.shield * 2 + s.counterAttack)
      self.turnBonus += bonus
      msg.push(`盾反 +${bonus}`)
    }
    if (effect.damage && s.vulnerablility > 0 && s.shield > 0) {
      self.multiplier += 0.5
      msg.push('易伤保护 本回合分数 +50%')
    }
    if (effect.weakStun && s.shield > 0) {
      self.multiplier += 0.3
      msg.push('眩晕格挡 本回合分数 +30%')
    }
    return msg
  }

  private settleTurnBonus(player: PvpPlayer): number {
    const gain = Math.round(player.turnBonus * player.multiplier)
    player.score += gain
    player.turnBonus = 0
    player.multiplier = 1
    return gain
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer)
      this.turnTimer = null
    }
  }

  private clearTimers() {
    this.clearTurnTimer()
    if (this.inviteTimer) {
      clearTimeout(this.inviteTimer)
      this.inviteTimer = null
    }
  }

  private resetTurnTimer() {
    this.clearTurnTimer()
    const idx = this.turn
    this.turnTimer = setTimeout(() => {
      if (this.phase !== 'playing' || this.turn !== idx) return
      this.finish(1 - idx, `${this.players[idx].name} 超过 60 秒未行动，判负`)
    }, TURN_TIMEOUT)
    this.turnTimer.unref?.()
  }

  // 统一收尾：清资源、停止监听、让控制器释放频道
  private settle(outcome: Outcome, reason: string): gameResult {
    this.phase = 'over'
    this.clearTimers()
    try {
      this.disposeListener()
    } catch (error) {
      logger.warn(`清理监听器失败：${error}`)
    }
    this.onFinish()

    if (outcome === 'cancel') {
      return { gameName: '一碰一', playerID: this.session.userId, message: reason, cancelled: true }
    }
    if (outcome === 'draw') {
      return {
        gameName: '一碰一',
        playerID: this.session.userId,
        message: reason,
        playerResults: [
          { playerID: this.players[0].userId, name: this.players[0].name, win: winFlag.draw, bonus: 0 },
          { playerID: this.players[1].userId, name: this.players[1].name, win: winFlag.draw, bonus: 0 },
        ],
      }
    }

    const winner = this.players[outcome]
    const loser = this.players[1 - outcome]
    // 押注随表现分与血量浮动，但封顶为血量的两倍，避免长局出现天文数字
    const rawStake = Math.round(winner.score * this.maxHp / 100)
    const stake = Math.max(10, Math.min(rawStake, this.maxHp * 2))
    logger.info(`一碰一 PvP 结束：${winner.userId}(score=${winner.score}) 胜 ${loser.userId}(score=${loser.score})，押注 ${stake}`)
    return {
      gameName: '一碰一',
      playerID: winner.userId,
      message: `${winner.name} 获胜`,
      playerResults: [
        { playerID: winner.userId, name: winner.name, win: winFlag.win, bonus: stake },
        { playerID: loser.userId, name: loser.name, win: winFlag.lose, bonus: -stake },
      ],
    }
  }

  private async abort(reason: string) {
    if (this.phase === 'over') return
    const result = this.settle('cancel', reason)
    try {
      await this.session.send(reason)
    } catch (error) {
      logger.warn(`发送取消消息失败：${error}`)
    } finally {
      this.ctx.emit('game-result', this.session, result)
    }
  }

  private async finish(outcome: number | 'draw', reason: string, detail?: string) {
    if (this.phase !== 'playing') return
    const result = this.settle(outcome, reason)
    let summary: string
    if (outcome === 'draw') {
      summary = '🤝 平局！本局不结算 p点。'
    } else {
      const winner = this.players[outcome]
      const loser = this.players[1 - outcome]
      const stake = result.playerResults[0].bonus
      summary = [
        `🏆 ${winner.name} 获胜！`,
        `表现分：${winner.name} ${winner.score}，${loser.name} ${loser.score}`,
        `押注：${stake} p点（由输家支付，余额不足时按实际余额结算）`,
      ].join('\n')
    }
    try {
      await this.session.send(await this.render(detail ? `${detail}\n\n${reason}\n${summary}` : `${reason}\n${summary}`))
    } catch (error) {
      logger.warn(`发送结算消息失败：${error}`)
    } finally {
      // 即使消息发送失败也必须结算，否则频道会一直占着
      this.ctx.emit('game-result', this.session, result)
    }
  }

  // 「结束游戏」由 Game 层调用；参与者主动结束视为认输
  public override async endGame(session?: Session): Promise<gameResult> {
    if (this.phase === 'over') {
      return { gameName: '一碰一', playerID: this.session.userId, message: '游戏已结束', cancelled: true }
    }
    if (this.phase === 'waiting') {
      const result = this.settle('cancel', '对战邀请已取消')
      try {
        await this.session.send('对战邀请已取消')
      } catch (error) {
        logger.warn(`发送取消消息失败：${error}`)
      }
      return result
    }

    const idx = this.players.findIndex((player) => player.userId === session?.userId)
    if (idx < 0) {
      // 管理员或闲置回收：不做胜负与 p点结算
      const result = this.settle('cancel', '对战已被结束')
      try {
        await this.session.send('对战已结束')
      } catch (error) {
        logger.warn(`发送结束消息失败：${error}`)
      }
      return result
    }

    const result = this.settle(1 - idx, `${this.players[idx].name} 认输`)
    const winner = this.players[1 - idx]
    const stake = result.playerResults[0].bonus
    try {
      await this.session.send(await this.render(`${this.players[idx].name} 认输，${winner.name} 获胜！\n押注：${stake} p点`))
    } catch (error) {
      logger.warn(`发送认输消息失败：${error}`)
    }
    return result
  }

  private rules = `游戏说明（1v1 对战）：
  两个人各自有两只手，每只手是 1~10 的手势，每个手势对应一个技能；两只手的特定组合还能触发组合技。
  轮到你时，输入「左 右」或「右 左」：用你的某一只手碰对方的某一只手。
  两只手数值相加，超过十只保留个位，这个数字会替换你被碰的那只手的手势，并触发对应技能。
  例如你的「一」碰对方的「二」变成「三」，触发「${SKILL_MAP['3'].name}」。
  双方开局手势随机，先手随机；双方初始血量相同，且初始没有护盾。
  当自身两手手势相同时，无论选择哪只手，最终发生变化的都是左手。
  率先把对方血量减到 0 的一方获胜。

  对战规则：
  每回合限时 60 秒，超时未行动直接判负；
  主动发送「结束游戏」视为认输；
  胜者从败者处赢取 p点，金额按胜者表现分与双方血量计算，败者余额不足时按实际余额结算；
  对局中途离开、邀请超时或邀请被拒绝时，不产生 p点结算。

  游戏名称说明：
  流血效果：每次到自己回合结束时，受到流血层数点伤害，不可被护盾阻挡，然后流血层数减 1；
  护盾效果：每一层护盾可阻挡下一次受到的普通伤害，若伤害来自组合技则消耗两层（仅一层时消耗一层）。护盾上限为五层。
  眩晕效果：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（不可被连续眩晕）；
  弱眩晕效果：若对方没有护盾，则眩晕对方一回合；
  反击：下一回合若对方行动中有攻击，则对方攻击前受到反击层数点穿刺伤害，受力量加成，仅持续一回合；
  穿刺伤害：不被护盾影响的伤害（不会消耗护盾）；
  力量效果：每有一点力量，每次造成的伤害 +1，若为负数则减一；
  易伤效果：受到的普通伤害 +50%，自己的回合结束时减少一层；
  组合技：触碰完成后，若你的两只手手势符合组合技条件则触发，组合技效果覆盖普通技能，组合无序。
  `
}

/**
 * 一碰一 对战控制器：负责邀请、双方消息转发与单局生命周期。
 */
export class OneTouchPvpGame extends abstractGame<OneTouchPvpSingleGame> {
  constructor() {
    super(OneTouchPvpSingleGame)
  }

  public override async startGame(session: Session, ctx: Context, args: string[]): Promise<abstractGameSingleGame | null> {
    if (this.channelGames.has(session.channelId)) return null
    const opponent = getMentionedUser(session)
    if (!opponent || opponent.id === session.userId) return null

    const maxHp = parseMaxHp(session)
    const dispose = ctx.on('message', this.listener(session.userId, session.guildId))
    const game = new OneTouchPvpSingleGame(
      dispose,
      session,
      ctx,
      opponent,
      maxHp,
      () => this.channelGames.delete(session.channelId),
    )
    this.channelGames.set(session.channelId, game)
    await game.startGame()
    return game
  }
}
