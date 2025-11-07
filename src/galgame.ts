import { Context, Session, h } from 'koishi';
import * as fs from 'fs';
import * as path from 'path';
import { wrapInHTML } from './utils';
import { Sat, User } from './types';
import { getUser, updateFavorability as dbUpdateFavorability, updateUserP as dbUpdateUserP, updateUserItems as dbUpdateUserItems } from './database';

interface StoryContent {
  id: number;
  text: string;
  options?: { text: string; targetId: number }[];
  imageName?: string;
  isEnding?: boolean;
  isNarration?: boolean;
}

interface EventData {
  eventName: string;
  favorabilityThreshold: number;
  story: StoryContent[];
  endings: {
    id: number;
    text: string;
    image?: string;
    favorabilityReward?: number;
    pReward?: number;
    itemRewards?: Record<string, number>;
  }[];
}

export class Galgame {
  private ongoingEvents: Record<string, string> = {};
  private waitingForOptions: Record<string, string> = {};
  private completedEvents: Record<string, string> = {};
  private currentId: Record<string, number> = {};

  constructor(private ctx: Context, private config: Sat.Config) {
    this.initialize();
  }

  private loadEvent(eventName: string): EventData | null {
    const filePath = path.resolve(this.config.dataDir, 'event', `${eventName}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  private async sendStoryContent(session: Session, content: StoryContent) {
  // 兼容事件文本中占位符写法：{_USERNAME_} 或 _USERNAME_
  const username = session.username || '你';
  const storyText = String(content.text).replace(/\{?_USERNAME_\}?/g, username);
    if (content.isNarration) {
      const wrappedText = await wrapInHTML(storyText, 40);
      await session.send(wrappedText);
    } else {
      await session.send(storyText);
    }

    if (content.imageName) {
      const imagePath = path.resolve(this.config.dataDir, 'event', content.imageName);
      if (fs.existsSync(imagePath)) {
        const buffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        await session.send(h.image(buffer, mime));
      }
    }
  }

  // 根据文本估算自动推进的延迟（毫秒）
  // 规则：使用平均阅读速度 200 wpm（可调整）来估算阅读时间（秒），
  // 然后在阅读时间上加上额外 3 秒缓冲，最终向上取整并转为毫秒。
  // 对中英文混合文本：中文按汉字计数，拉丁文按空格分词计数。
  private computeAutoAdvanceDelay(text: string): number {
    const readingWpm = 500; // 平均阅读速度（词/分钟），可根据需要调整或改为配置项

    if (!text) return 1000; // 回退值（1s）以防空文本

    // 统计中文字符数（基本 CJK 范围）
    const cjkMatch = text.match(/[\u4e00-\u9fff]/g) || [];
    const cjkCount = cjkMatch.length;

    // 把中文去掉后再按空白分词统计拉丁文单词数
    const withoutCjk = text.replace(/[\u4e00-\u9fff]/g, '');
    const latinWords = withoutCjk.trim().length === 0 ? 0 : (withoutCjk.trim().split(/\s+/).filter(Boolean).length);

    const effectiveWords = cjkCount + latinWords;

    // 每秒词数
    const wordsPerSecond = readingWpm / 60;
    const readingSeconds = effectiveWords / Math.max(wordsPerSecond, 0.001);

    // 在阅读时间上加 2 秒缓冲并向上取整为整数秒，至少 1 秒
    const delaySeconds = Math.max(1, Math.ceil(readingSeconds) + 2);
    return delaySeconds * 1000;
  }

  private async handleEventProgress(session: Session, event: EventData) {
    const userId = session.userId;
    const currentId = this.currentId[userId];
    const content = event.story.find((item) => item.id === currentId);
    if (!content) return;

    await this.sendStoryContent(session, content);

    if (content.isEnding) {
      const ending = event.endings.find((end) => end.id === currentId);
      if (ending) {
        await this.handleEnding(session, ending);
      }
      delete this.ongoingEvents[userId];
      delete this.currentId[userId];
      this.completedEvents[userId] = event.eventName;
      return;
    }

    if (content.options) {
      // 发送选项列表给用户并提示如何选择
      const optionsText = content.options.map((opt, idx) => `选项 ${idx + 1}: ${opt.text}`).join('\n');
      await session.send(optionsText + '\n发送格式类似 "选项 1" 来进行选择');

      // 切换用户状态：从进行中 -> 等待选项中
      delete this.ongoingEvents[userId];
      this.waitingForOptions[userId] = event.eventName;
      // currentId 保持为当前项，以便 handleOption 能找到选项
    } else {
      // 继续推进到下一个 id（保持与原逻辑一致，简单 +1）
      const delay = this.computeAutoAdvanceDelay(content.text);
      setTimeout(() => {
        // 更新用户当前 id 并继续
        this.currentId[userId] = (this.currentId[userId] ?? currentId) + 1;
        this.handleEventProgress(session, event);
      }, delay);
    }
  }

  private async handleEnding(session: Session, ending: EventData['endings'][number]) {
    // 把结局文本和奖励信息合并成一条消息发送
    const rewardParts: string[] = [];
    if (ending.favorabilityReward) {
      rewardParts.push(`好感度 +${ending.favorabilityReward}`);
    }
    if (ending.pReward) {
      rewardParts.push(`P点 +${ending.pReward}`);
    }
    if (ending.itemRewards) {
      for (const [name, qty] of Object.entries(ending.itemRewards)) {
        rewardParts.push(`${name} x${qty}`);
      }
    }

    const rewardText = rewardParts.length ? `\n\n获得奖励：\n${rewardParts.join('\n')}` : '';
    await session.send(ending.text + rewardText);
    if (ending.image) {
      const imagePath = path.resolve(this.config.dataDir, 'event', ending.image);
      if (fs.existsSync(imagePath)) {
        const buffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        await session.send(h.image(buffer, mime));
      }
    }
    if (ending.favorabilityReward) {
      await this.updateFavorability(session, ending.favorabilityReward);
    }
    if (ending.pReward) {
      await this.updatePPoints(session, ending.pReward);
    }
    if (ending.itemRewards) {
      await this.updateItemRewards(session, ending.itemRewards);
    }
  }

  private async updateFavorability(session: Session, adjustment: number) {
    const user: User = await getUser(this.ctx, session.userId);
    if (!user) return;
    await dbUpdateFavorability(this.ctx, user, adjustment);
  }
  private async updatePPoints(session: Session, adjustment: number) {
    const user: User = await getUser(this.ctx, session.userId);
    if (!user) return;
    await dbUpdateUserP(this.ctx, user, adjustment);
  }
  private async updateItemRewards(session: Session, rewards: Record<string, number>) {
    const user: User = await getUser(this.ctx, session.userId);
    if (!user) return;

    for (const [itemName, quantity] of Object.entries(rewards)) {
      if (!user.items[itemName]) {
        user.items[itemName] = { id: itemName, count: 0 };
      }
      user.items[itemName].count += quantity;
    }

    await dbUpdateUserItems(this.ctx, user);
  }

  public async startEvent(session: Session, eventName?: string) {
    const user: User = await getUser(this.ctx, session.userId);
    if (this.completedEvents[session.userId]) {
      await session.send('今天已经进行过约会了，请明天再来吧！');
      return;
    }

    if (!eventName) {
      const eventDir = path.join(this.config.dataDir, 'event');
      if (!fs.existsSync(eventDir)) {
        await this.initialize();
      }
      const events = fs.readdirSync(eventDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => this.loadEvent(file.replace('.json', '')))
        .filter((event) => event && user.favorability >= event.favorabilityThreshold)
        .map((event) => event.eventName);

      const result = '当前可用的约会事件有：\n' + events.join('\n') + '\n请输入命令：约会 [事件名] 来开始对应的事件。';
      const wrappedText = await wrapInHTML(result);
      await session.send(wrappedText);
      return;
    }

    const event = this.loadEvent(eventName);
    if (!event) {
      await session.send('未找到指定事件。');
      return;
    }

    if (user.favorability < event.favorabilityThreshold) {
      await session.send('好感度不足，无法解锁此事件。');
      return;
    }

    this.ongoingEvents[session.userId] = eventName;
    // 初始化用户当前进度为 id 1，然后推进事件（handleEventProgress 使用 this.currentId）
    this.currentId[session.userId] = 1;
    await this.handleEventProgress(session, event);
  }

  public async handleOption(session: Session, optionId: number) {
    const userId = session.userId;
    const eventName = this.waitingForOptions[userId];
    if (!eventName) {
      await session.send('未开始事件或当前没有可选的选项。');
      return;
    }

    const event = this.loadEvent(eventName);
    if (!event) return;

    const currentId = this.currentId[userId];
    if (currentId === undefined) {
      await session.send('无法确定当前进度。');
      return;
    }

    const currentContent = event.story.find((item) => item.id === currentId);
    if (!currentContent || !currentContent.options) {
      await session.send('当前项没有可选项。');
      return;
    }

    const index = optionId - 1; // optionId 为 1-based 索引
    const selectedOption = currentContent.options[index];
    if (!selectedOption) {
      await session.send('无效选项，请发送例如：选项 1');
      return;
    }

    // 用户选择后，切换回进行中并更新当前进度为选项的 targetId，然后继续推进
    delete this.waitingForOptions[userId];
    this.ongoingEvents[userId] = eventName;
    this.currentId[userId] = selectedOption.targetId;
    await this.handleEventProgress(session, event);
  }

  public async initialize() {
    const eventDir = path.join(this.config.dataDir, 'event');

    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    const files = fs.readdirSync(eventDir);
    if (files.length === 0) {
      const exampleEvent = {
        eventName: '示例事件',
        favorabilityThreshold: 0,
        story: [
          {
            id: 1,
            isNarration: true,
            text: `这是示例事件（文件位置：data/event/示例事件.json）。\n\n打开工作区的 data/event 文件夹，找到并打开此文件，你会看到一个 JSON 描述的事件对象。字段说明（常用）：\n- eventName: 事件名（字符串）\n- favorabilityThreshold: 解锁本事件所需的好感度阈值（数字）\n- story: 段落数组，按 id 查找并推进，每项字段：id, type, text, options, imageName, isEnding, isNarration。\n\n本示例展示两种机制：\n1) 无选项自动推进：某段没有 options，会在若干秒后自动推进到下一段（由代码中 setTimeout 控制，默认 5 秒）；\n2) 分支效果：某段含有 options，用户选择后跳转到对应的 targetId 导致不同的结局。\n\n下面开始演示，发送“开始”或选择下方的继续按钮（示例内也会提示如何选择）。`,
            options: [
              { text: '开始示例', targetId: 2 },
            ],
          },
          {
            id: 2,
            text: `这是一个无选项段落，演示自动推进；几秒后会自动进入下一段（时间根据文本长度）。`,
          },
          {
            id: 3,
            isNarration: true,
            text: `在事件json中，有多个字段，我们从头开始说明。
eventName: 事件名（字符串），此字段要与文件名一致
favorabilityThreshold: 解锁本事件所需的好感度阈值（数字）
story 为有序的段落数组，每项至少需要 id 和 text。
支持字段：
 - id: 唯一数字 id，用于跳转定位
 - text: 要显示的文本
 - options: 可选，数组，每项 { text, targetId }，如果存在则等待用户选择，用户选择后跳转到对应 targetId 的段落
 - imageName: 可选，指向 data/event 下的图片文件名然后发送
 - isEnding: 可选，标记该段落为结局（会触发结束+奖励）
 - isNarration: 可选，指示用图片渲染（用于旁白会比较好）
 此段即演示isNarration和imageName效果`,
            imageName: 'example.png',
          },
          {
            id: 4,
            text: '此段展示分支和用户名占位，现在进入分支环节：请选择_USERNAME_的回应。\n发送格式：选项 1 或 选项 2。',
            options: [
              { text: '友好回应', targetId: 5 },
              { text: '冷淡回应', targetId: 6 },
            ],
          },
          {
            id: 5,
            text: '你选择了友好回应，达成友好分支。此时会跳转到与当前段落 id 相同的结局。',
            isEnding: true,
          },
          {
            id: 6,
            text: '你选择了冷淡回应，达成冷淡分支。此时会跳转到与当前段落 id 相同的结局。',
            isEnding: true,
          },
        ],
        endings: [
          {
            id: 5,
            text: 'endings 列表用于将结局 id 与奖励、图片等信息关联，在友好分支结局：你获得了好感和奖励。\n现在你可以根据需要设计自己的事件。',
            favorabilityReward: 1,
            pReward: 5,
            itemRewards: { '垃圾符卡': 1 },
            imageName: 'example.png',
          },
          {
            id: 6,
            text: 'endings 列表用于将结局 id 与奖励、图片等信息关联，在冷淡分支结局：好感略微下降。\n现在你可以根据需要设计自己的事件。',
            favorabilityReward: -1,
          },
        ],
      };

      const exampleFilePath = path.resolve(eventDir, '示例事件.json');
      fs.writeFileSync(exampleFilePath, JSON.stringify(exampleEvent, null, 2), 'utf-8');

      // 保留一个示例图片（同原代码），如果不存在则写入 example.png
      const exampleImagePath = path.resolve(eventDir, 'example.png');
      try {
        if (!fs.existsSync(exampleImagePath)) {
          const imageBuffer = Buffer.from(exampleimg, 'base64');
          fs.writeFileSync(exampleImagePath, imageBuffer);
        }
      } catch (e) {
        // 忽略写图片错误，示例事件仍可工作
      }
    }
  }
}


const exampleimg = `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`
