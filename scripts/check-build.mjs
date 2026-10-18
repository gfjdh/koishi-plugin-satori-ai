// 发布前的构建校验。
//
// package.json 的 prepublishOnly 是 `tsc`，而 tsconfig 是 emitDeclarationOnly:
// 它只重写 lib/**/*.d.ts，**一个字节都不碰 lib/index.js**。直接 npm publish
// 会把磁盘上那份旧 bundle 原样发出去，全程没有任何报错。
//
// 真正重新打包的是仓库根的 yakumo 流水线（tsc + esbuild + client）：
//     cd <koishi-app 仓库根> && npx yakumo build satori-ai
// 插件自己的 `npm run build` 做不到，所以这里在打包前拦住不一致的状态。
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const bundle = join(root, 'lib', 'index.js')
const sourceDir = join(root, 'src')

const RELOAD = '重新构建：cd <koishi-app 仓库根> && npx yakumo build satori-ai'

/** root 带尾分隔符，相对路径要顺手把 Windows 的反斜杠正过来 */
const rel = (path) => path.slice(root.length).split('\\').join('/')

/** 递归取目录里最新的一个文件 */
async function newestFile(dir) {
  let newest = null
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = await newestFile(path)
      if (found && (!newest || found.mtimeMs > newest.mtimeMs)) newest = found
    } else if (entry.isFile()) {
      const info = await stat(path)
      if (!newest || info.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: info.mtimeMs }
    }
  }
  return newest
}

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

const bundleTime = await mtimeOf(bundle)
if (bundleTime === null) {
  console.error(`✗ 找不到 ${bundle}——先构建再发布。\n  ${RELOAD}`)
  process.exit(1)
}

const newest = await newestFile(sourceDir).catch(() => null)
if (!newest) {
  // 只发布打包产物时（例如从 tarball 展开的目录）没有 src，无法判断
  console.warn('· 没有 src/ 目录，跳过构建校验')
  process.exit(0)
}

if (newest.mtimeMs > bundleTime) {
  const delta = Math.round((newest.mtimeMs - bundleTime) / 1000)
  console.error(
    '✗ lib/index.js 比 src 旧，发出去的就是旧 bundle：\n'
    + `    lib/index.js  ${new Date(bundleTime).toISOString()}\n`
    + `    ${rel(newest.path)}  ${new Date(newest.mtimeMs).toISOString()}（新 ${delta}s）\n`
    + `  ${RELOAD}`)
  process.exit(1)
}

console.log(`✓ lib/index.js 不早于 src（最新源码 ${rel(newest.path)}）`)