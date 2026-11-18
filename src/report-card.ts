// src/report-card.ts
// 群日报/周报/月报/年报的报纸版式。只负责把结构化内容拼成 HTML，
// 实际截图由调用方的 puppeteer.render 完成。
import { ReportSections } from './memory/group-digest'

export interface ReportCardStats {
  messages: number
  nodes: number
  participants: number
}

export interface ReportCardRanking {
  name: string
  count: number
  comment: string
}

export interface ReportCardInput {
  /** 刊名，如「心眼报」 */
  masthead: string
  /** 群日报 / 群周报 / 群月报 / 群年报 */
  kindTitle: string
  /** 2026.11.18 */
  dateLabel: string
  /** 第几期；0 表示不显示 */
  issue: number
  /** 报告覆盖的时间范围 */
  range: string
  stats: ReportCardStats
  /** 最近 24 小时每小时消息数，索引 0-23 */
  hourly: number[]
  sections: ReportSections
  ranking: ReportCardRanking[]
  /** 活跃榜标题（年报只反映最近 30 天） */
  rankingLabel: string
  /** 报尾署名与点评落款 */
  footerName: string
  /** 报尾生成时间 */
  footerTime: string
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 多段正文拆成 <p>；模型偶尔用单换行分段，这里一并处理 */
function paragraphs(text: string): string[] {
  return (text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
}

function sectionTitle(text: string): string {
  return `<div class="sec-title">${escapeHtml(text)}</div>`
}

function renderMeta(input: ReportCardInput): string {
  const words = input.sections.hotwords
  const hot = words.length
    ? `<span class="hot-label">本期热词</span>${words.map(word => `<span class="tag">${escapeHtml(word)}</span>`).join('')}`
    : ''
  return `<div class="meta"><div class="hotwords">${hot}</div><span class="range">${escapeHtml(input.range)}</span></div>`
}

/** 24 小时柱状图：每根柱子按最高值等比缩放 */
function renderActivity(input: ReportCardInput): string {
  const values = input.hourly.length === 24 ? input.hourly : new Array(24).fill(0)
  const max = Math.max(...values, 0)
  const peak = values.indexOf(max)
  const bars = values.map((count, hour) => {
    const height = max > 0 ? Math.max(2, Math.round(count / max * 30)) : 2
    const active = max > 0 && count === max ? ' peak' : ''
    return `<span class="bar${active}" style="height:${height}px" title="${hour} 时 ${count} 条"></span>`
  }).join('')
  const peakLabel = max > 0 ? `峰值 ${String(peak).padStart(2, '0')} 时 · ${max} 条` : '暂无消息'
  return `<div class="activity">
    <span class="activity-label">24h 活跃轨迹</span>
    <div class="spark">${bars}</div>
    <span class="activity-peak">${escapeHtml(peakLabel)}</span>
  </div>`
}

function renderStats(input: ReportCardInput): string {
  const stats = [
    `${input.stats.nodes} 条记忆`,
    `${input.stats.messages} 条消息`,
    `${input.stats.participants} 位群友`,
  ].join(' · ')
  return `<div class="stats">${escapeHtml(stats)}</div>`
}

function renderNews(sections: ReportSections): string {
  if (!sections.news.length) return ''
  const totalChars = sections.news.reduce((sum, item) => sum + item.body.length, 0)
  // 短稿单栏，长稿双栏；每条要闻不跨栏
  const columns = totalChars > 300 ? ' two-col' : ''
  const items = sections.news.map(item => {
    const title = item.title ? `<div class="news-title">${escapeHtml(item.title)}</div>` : ''
    const body = paragraphs(item.body).map(line => `<p>${escapeHtml(line)}</p>`).join('')
    return `<div class="news-item">${title}<div class="news-body">${body}</div></div>`
  }).join('')
  // 首段以引号/括号开头时不做首字下沉，否则标点会被一起放大
  const firstChar = (sections.news[0].body || '').trim()[0] || ''
  const noDrop = /[「『“"（(《【]/.test(firstChar) ? ' no-drop' : ''
  return `${sectionTitle('本群要闻')}<div class="news-flow${columns}${noDrop}">${items}</div>`
}

function renderQuotes(sections: ReportSections): string {
  const quotes = sections.quotes.filter(item => item.text)
  if (!quotes.length) return ''
  const body = quotes.map(item => `<div class="quote">
    <div class="qtext">${escapeHtml(item.text)}</div>
    ${item.speaker ? `<div class="qwho">—— ${escapeHtml(item.speaker)}</div>` : ''}
    ${item.comment ? `<div class="qcomment">${escapeHtml(item.comment)}</div>` : ''}
  </div>`).join('')
  return `${sectionTitle('群友金句')}<div class="quotes">${body}</div>`
}

function renderRanking(input: ReportCardInput): string {
  if (!input.ranking.length) return ''
  const max = Math.max(...input.ranking.map(item => item.count), 1)
  const rows = input.ranking.map((item, index) => {
    const width = Math.max(4, Math.round(item.count / max * 100))
    return `<div class="rank-item">
      <div class="rank-line">
        <span class="rank-no">${index + 1}</span>
        <span class="rank-name">${escapeHtml(item.name)}</span>
        <span class="rank-bar-wrap"><span class="rank-bar" style="width:${width}%"></span></span>
        <span class="rank-count">${item.count} 条</span>
      </div>
      ${item.comment ? `<div class="rank-note">${escapeHtml(item.comment)}</div>` : ''}
    </div>`
  }).join('')
  return `${sectionTitle(input.rankingLabel)}<div class="ranking">${rows}</div>`
}

function renderComment(input: ReportCardInput): string {
  const items = paragraphs(input.sections.comment)
  if (!items.length) return ''
  const body = items.map(item => `<p>${escapeHtml(item)}</p>`).join('')
  return `<div class="comment">
    <div class="comment-title">点 评</div>
    <div class="comment-body">${body}</div>
    <div class="comment-sign">—— ${escapeHtml(input.footerName)}</div>
  </div>`
}

function renderFallback(sections: ReportSections): string {
  return `${sectionTitle('本群要闻')}<div class="fallback">${escapeHtml(sections.fallback)}</div>`
}

export function renderReportHtml(input: ReportCardInput): string {
  const { sections } = input
  const structured = sections.structured
  const headline = structured && sections.headline
    ? `<h1 class="headline">${escapeHtml(sections.headline)}</h1>`
    : ''
  const lead = structured && sections.lead
    ? `<div class="lead">${escapeHtml(sections.lead)}</div>`
    : ''
  const body = structured
    ? `${renderNews(sections)}${renderQuotes(sections)}${renderRanking(input)}${renderComment(input)}`
    : renderFallback(sections)

  const issue = input.issue > 0 ? `第 ${input.issue} 期` : ''

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: #fbf8f1; }
  /* body 收缩到纸张宽度，截图正好是整张报纸，不留背景边 */
  body {
    display: inline-block;
    font-family: "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif;
    color: #2b2420;
  }
  .paper {
    width: 720px; box-sizing: border-box; padding: 26px 32px 22px;
    background: #fbf8f1;
  }
  .serif, .name, .headline, .sec-title, .comment-title, .qtext, .kindline, .news-title {
    font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  }

  .masthead { display: flex; align-items: flex-end; justify-content: space-between; }
  .name { font-size: 38px; font-weight: 700; letter-spacing: 12px; color: #2b2420; }
  .issue { text-align: right; font-size: 12px; line-height: 1.8; color: #7b6a58; }

  .kindline {
    margin-top: 10px; padding: 7px 0; text-align: center;
    font-size: 13px; letter-spacing: 12px; color: #6d4f8f;
    border-top: 3px double #3a2f28; border-bottom: 1px solid #d9cbb4;
  }
  .meta {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    margin-top: 10px; font-size: 12px; color: #7b6a58;
  }
  .hotwords { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .hot-label { margin-right: 2px; color: #8b7a66; letter-spacing: 1px; white-space: nowrap; }
  .tag {
    padding: 2px 10px; font-size: 11px; color: #5b4636; white-space: nowrap;
    border: 1px solid #cdb9a2; border-radius: 999px; background: #f6f1e6;
  }
  .range { white-space: nowrap; }

  .activity {
    display: flex; align-items: center; gap: 12px;
    margin-top: 10px; padding-bottom: 10px; border-bottom: 1px solid #d9cbb4;
  }
  .activity-label { font-size: 11px; color: #8b7a66; letter-spacing: 1px; white-space: nowrap; }
  .spark { flex: 1; display: flex; align-items: flex-end; gap: 2px; height: 32px; }
  .spark .bar { flex: 1; background: #c9b3e0; border-radius: 1px 1px 0 0; }
  .spark .bar.peak { background: #6d4f8f; }
  .activity-peak { font-size: 11px; color: #8b7a66; white-space: nowrap; }

  .stats { margin-top: 8px; font-size: 11px; color: #9a8a76; letter-spacing: .5px; }

  .headline {
    margin: 22px 0 10px; font-size: 30px; font-weight: 700;
    line-height: 1.38; letter-spacing: 1px; color: #231d19;
  }
  .lead {
    margin-bottom: 6px; padding: 2px 0 2px 12px; font-size: 14px;
    line-height: 1.85; color: #5d5044; border-left: 3px solid #6d4f8f;
  }

  .sec-title {
    margin: 26px 0 12px; padding-left: 9px; font-size: 14px; font-weight: 700;
    letter-spacing: 4px; color: #5b4636; border-left: 4px solid #6d4f8f;
  }

  .news-flow { font-size: 15px; line-height: 1.95; text-align: justify; }
  .news-flow.two-col { column-count: 2; column-gap: 28px; column-rule: 1px solid #e2d6c2; }
  .news-item { break-inside: avoid; margin-bottom: 16px; }
  .news-title { font-size: 17px; font-weight: 700; line-height: 1.5; color: #3a3029; margin-bottom: 4px; }
  .news-body p { margin: 0 0 8px; text-indent: 2em; }
  .news-body p:last-child { margin-bottom: 0; }
  .news-flow > .news-item:first-child .news-body p:first-child { text-indent: 0; }
  .news-flow > .news-item:first-child .news-body p:first-child::first-letter {
    float: left; margin: 5px 7px 0 0; font-size: 44px; line-height: .92;
    font-weight: 700; color: #6d4f8f;
    font-family: "Noto Serif CJK SC", "SimSun", serif;
  }
  .news-flow.no-drop > .news-item:first-child .news-body p:first-child::first-letter {
    float: none; margin: 0; font-size: inherit; line-height: inherit;
    font-weight: inherit; color: inherit; font-family: inherit;
  }

  .quotes { display: flex; flex-direction: column; gap: 14px; }
  .quote { position: relative; padding: 2px 0 2px 20px; }
  .quote::before {
    content: "“"; position: absolute; left: 0; top: -6px;
    font-family: Georgia, "Noto Serif CJK SC", serif; font-size: 38px;
    line-height: 1; color: #c6b4dc;
  }
  .qtext { font-size: 16px; line-height: 1.8; color: #3a3029; }
  .qwho { margin-top: 3px; text-align: right; font-size: 12px; color: #8b7a66; }
  .qcomment { margin-top: 5px; padding-left: 16px; font-size: 12px; line-height: 1.7; color: #6d4f8f; }
  .qcomment::before { content: "▸ "; color: #a98cc4; }

  .rank-item { margin-bottom: 10px; }
  .rank-line { display: flex; align-items: center; gap: 10px; }
  .rank-no {
    width: 20px; height: 20px; line-height: 20px; text-align: center;
    font-size: 11px; color: #fff5ee; background: #6d4f8f; border-radius: 3px;
  }
  .rank-name { width: 120px; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-bar-wrap { flex: 1; height: 8px; background: #ece3d4; border-radius: 2px; overflow: hidden; }
  .rank-bar { display: block; height: 100%; background: #a98cc4; border-radius: 2px; }
  .rank-count { width: 52px; text-align: right; font-size: 11px; color: #8b7a66; }
  .rank-note { margin: 3px 0 0 30px; font-size: 12px; line-height: 1.7; color: #6b5a48; }

  .comment { margin-top: 28px; padding-top: 14px; border-top: 2px solid #3a2f28; }
  .comment-title { font-size: 14px; font-weight: 700; letter-spacing: 6px; color: #5b4636; margin-bottom: 10px; }
  .comment-body { padding-left: 2.6em; font-size: 15px; line-height: 1.95; color: #3a3029; text-align: justify; }
  .comment-body p { margin: 0 0 8px; text-indent: 2em; }
  .comment-body p:last-child { margin-bottom: 0; }
  .comment-sign { margin-top: 10px; text-align: right; font-size: 13px; letter-spacing: 2px; color: #5b4636; }

  .fallback { font-size: 15px; line-height: 1.95; white-space: pre-wrap; word-break: break-word; text-align: justify; }

  .footer {
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px;
    margin-top: 20px; padding-top: 9px;
    font-size: 10px; color: #9a8a76; border-top: 1px solid #d9cbb4;
  }
</style></head><body><div class="paper">
  <div class="masthead">
    <div class="name">${escapeHtml(input.masthead)}</div>
    <div class="issue"><div>${escapeHtml(input.dateLabel)}</div>${issue ? `<div>${escapeHtml(issue)}</div>` : ''}</div>
  </div>
  <div class="kindline">${escapeHtml(input.kindTitle)}</div>
  ${renderMeta(input)}
  ${renderActivity(input)}
  ${renderStats(input)}
  ${headline}
  ${lead}
  ${body}
  <div class="footer"><span>${escapeHtml(input.masthead)} · ${escapeHtml(input.footerName)}</span><span>${escapeHtml(input.footerTime)} 生成</span></div>
</div></body></html>`
}
