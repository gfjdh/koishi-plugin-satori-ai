// 画像条目渲染测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-profile-render.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：群画像把昵称编码在 "member:昵称" 的 key 里，
// 展示和注入系统提示时必须把昵称补回去，不能再出现没有主语的“活跃群友”。
import { ProfileManager, displayProfileContent } from '../src/memory/profile'
import {
  GROUP_CATEGORY_LABELS, GROUP_CATEGORY_ORDER, buildGroupProfilePrompt,
} from '../src/memory/prompts'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const entry = (key: string, category: string, content: string, importance = 20) => ({
  key, category, content, importance, updatedAt: '2026-11-14T00:00:00.000Z',
})

// ---------- 场景 1：displayProfileContent 直接测 ----------
{
  const named = entry('member:清水尚辉', 'member', '群内技术型成员，负责为群添加群聊记忆功能。')
  assert(
    displayProfileContent(named, ['member']) === '清水尚辉：群内技术型成员，负责为群添加群聊记忆功能。',
    'member 条目缺少主语时，把 key 里的昵称补到 content 前面',
  )

  const selfTitled = entry('member:玄玄', 'member', '玄玄：活跃群友，会调侃“大肥鱼噬主”。')
  assert(
    displayProfileContent(selfTitled, ['member']) === selfTitled.content,
    'content 已经以昵称开头时不重复补前缀',
  )

  const topic = entry('topic:群聊记忆功能', 'topic', '群里在讨论群聊记忆功能。')
  assert(
    displayProfileContent(topic, ['member']) === topic.content,
    '非 member 类别原样输出',
  )

  const noColon = entry('玄玄', 'member', '活跃群友。')
  assert(
    displayProfileContent(noColon, ['member']) === noColon.content,
    'key 里没有昵称时原样输出',
  )

  assert(
    displayProfileContent(named, []) === named.content,
    '未配置 nameKeyCategories 时（个人画像）原样输出',
  )
}

// ---------- 场景 2：ProfileManager 的两处输出都带上昵称 ----------
async function testManagers() {
  const entries = [
    entry('member:清水尚辉', 'member', '群内技术型成员，负责为群添加群聊记忆功能。', 30),
    entry('member:玄玄', 'member', '玄玄：活跃群友，会调侃“大肥鱼噬主”。', 25),
    entry('topic:群聊记忆功能', 'topic', '群里在讨论群聊记忆功能。', 20),
  ]
  const repo = {
    getProfile: async (scopeId: string) => ({
      scopeId,
      data: { entries, lastSummarizedAt: '2026-11-14T00:00:00.000Z' },
      updatedAt: new Date('2026-11-14T00:00:00.000Z'),
    }),
  }

  const group = new ProfileManager({} as any, repo as any, {} as any, {
    enabled: true, dryRun: false, maxEntries: 100, contextEntries: 10,
    categoryLabels: GROUP_CATEGORY_LABELS,
    categoryOrder: GROUP_CATEGORY_ORDER,
    contextTitle: '以下是这个群的补充信息：',
    subjectLabel: '群',
    nameKeyCategories: ['member'],
  })
  const personal = new ProfileManager({} as any, repo as any, {} as any, {
    enabled: true, dryRun: false, maxEntries: 100, contextEntries: 10,
  })

  const context = await group.getContext('g:123')
  assert(context.includes('· 清水尚辉：群内技术型成员'), '群画像注入系统提示时成员条目带昵称')
  assert(!context.includes('· 群内技术型成员'), '系统提示里不再出现没有主语的成员条目')
  assert(context.includes('· 群里在讨论群聊记忆功能。'), '非成员条目保持原样')

  const formatted = await group.formatById('g:123')
  assert(formatted.includes('- [活跃群友] 清水尚辉：群内技术型成员'), '画像命令输出里成员条目带昵称')
  assert(formatted.includes('- [活跃群友] 玄玄：活跃群友'), '画像命令输出对已带昵称的内容不重复前缀')

  const personalContext = await personal.getContext('u:456')
  assert(personalContext.includes('· 群内技术型成员'), '个人画像不受群画像渲染影响')

  // ---------- 场景 3：群画像只在有新归档块时更新 ----------
  let hasNew = false
  let calls = 0
  let saves = 0
  const gateRepo = {
    getProfile: async (scopeId: string) => ({
      scopeId,
      data: { entries, lastSummarizedAt: '2026-11-15T04:00:00.000Z' },
      updatedAt: new Date('2026-11-15T04:00:00.000Z'),
    }),
    hasMemoriesCreatedSince: async () => hasNew,
    saveProfile: async () => { saves += 1 },
  }
  const gateApi = {
    auxiliaryChat: async () => {
      calls += 1
      return {
        content: JSON.stringify({
          added: [{ key: 'topic:新话题', category: 'topic', content: '群里聊了新话题。', importance: 20 }],
          modified: [],
          deleted: [],
        }),
        error: false,
      }
    },
  }
  const gated = new ProfileManager({} as any, gateRepo as any, gateApi as any, {
    enabled: true, dryRun: false, maxEntries: 100, contextEntries: 10,
    buildPrompt: buildGroupProfilePrompt,
    categoryLabels: GROUP_CATEGORY_LABELS,
    categoryOrder: GROUP_CATEGORY_ORDER,
    requireNewMemoryOf: 'topic',
  })

  const skipped = await gated.summarize('g:123', '昨天群里聊了一会儿。', [], null, new Date())
  assert(skipped === 'skipped', '上次画像更新之后没有新 topic 记忆时跳过')
  assert(calls === 0 && saves === 0, '跳过时不调用模型、不写库')

  hasNew = true
  const updated = await gated.summarize('g:123', '昨天群里聊了一会儿。', [], null, new Date())
  assert(updated === 'ok', '有新归档块时才更新画像')
  assert(calls === 1 && saves === 1, '更新时调用一次模型并落库')
}

testManagers().catch((err) => {
  console.error(err)
  process.exit(1)
})

