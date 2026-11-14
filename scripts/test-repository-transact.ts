// 事务串行化测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-repository-transact.ts
// 不连数据库：用一个会在并发时抛错的假 transact 模拟 SQLite 的行为。
//
// 要保证的事：群消息批量写入与归档提交同时发生时，事务仍然一个接一个地执行；
// 某一次事务失败不会把后面的排队任务卡死。
import { MemoryRepository } from '../src/memory/repository'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const row = { scopeId: 'g:1', userId: 'u1', username: '灵梦', kind: 'ambient', userContent: 'hi', aiContent: '', createdAt: new Date() }
const memory = {
  scopeId: 'g:1',
  granularity: 'topic',
  topic: '',
  content: '摘要',
  userState: '',
  periodStart: new Date(),
  periodEnd: new Date(),
  sourceCount: 1,
  createdAt: new Date(),
}

async function main() {
  // ---------- 场景 1：并发调用被串行化 ----------
  {
    let active = 0
    let maxActive = 0
    let completed = 0
    const db = {
      transact: async (fn: any) => {
        if (active > 0) throw new Error('cannot start a transaction within a transaction')
        active++
        maxActive = Math.max(maxActive, active)
        try {
          const result = await fn({ create: async () => {}, set: async () => {} })
          completed++
          return result
        } finally {
          active--
        }
      },
    }
    const repo = new MemoryRepository({ database: db } as any)

    await Promise.all([
      repo.createDialogueBatch([row]),
      repo.commitTopicArchive(memory, 'g:1', new Date()),
      repo.commitTopicArchives([memory], 'g:1', new Date()),
      repo.createDialogueBatch([row]),
    ])

    assert(maxActive === 1, `同一时刻只有一个事务在跑（实际 ${maxActive}）`)
    assert(completed === 4, `四个事务全部完成（实际 ${completed}）`)
  }

  // ---------- 场景 2：失败的事务不会堵住后面的任务 ----------
  {
    let calls = 0
    const db = {
      transact: async (fn: any) => {
        calls++
        if (calls === 1) throw new Error('boom')
        return fn({ create: async () => {}, set: async () => {} })
      },
    }
    const repo = new MemoryRepository({ database: db } as any)

    let failed = false
    try {
      await repo.createDialogueBatch([row])
    } catch {
      failed = true
    }
    assert(failed, '第一次事务按预期失败')

    await repo.createDialogueBatch([row])
    assert(calls === 2, '失败后链条继续，第二次事务仍然执行')
  }

  console.log('\n全部通过')
  // 显式退出：esbuild-register / koishi 可能留下活动句柄，不退出会让脚本挂住
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
