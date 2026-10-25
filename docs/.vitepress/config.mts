import { defineConfig } from 'vitepress'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Feed } from 'feed'

// 站点根地址是唯一的开关：本地/阿里云构建不设它（默认 lansn.net），Actions 构建传 bim.lansn.net。
// base 从它的路径段推出来 —— 自定义域名（CNAME）指向站点根时是 '/'，
// 换成 owner.github.io/仓库名 这类项目站点时会自动变成 '/仓库名/'。
const SITE = (process.env.SITE_URL ?? 'https://lansn.net').replace(/\/+$/, '')
const SITE_PATH = new URL(`${SITE}/`).pathname.replace(/\/+$/, '')
const BASE = SITE_PATH === '' ? '/' : `${SITE_PATH}/`
const HERE = dirname(fileURLToPath(import.meta.url)) // docs/.vitepress

/** 递归收集 srcDir 下的 md（跳过下划线开头的私有片段与 .vitepress） */
function collectMd(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.vitepress' || e.name.startsWith('_')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...collectMd(full))
    else if (e.name.endsWith('.md')) out.push(full)
  }
  return out
}

function titleOf(md: string, fallback: string): string {
  const src = readFileSync(md, 'utf8')
  const fm = /^---\n[\s\S]*?^title:\s*(.+)$/m.exec(src)
  if (fm) return fm[1].trim().replace(/^["']|["']$/g, '')
  const h1 = /^#\s+(.+)$/m.exec(src)
  return h1 ? h1[1].trim() : fallback
}

/** 路由：docs/guide/api.md → /guide/api；docs/index.md → / */
function urlOf(md: string, srcDir: string): string {
  const rel = relative(srcDir, md).replace(/\\/g, '/')
  return '/' + (rel === 'index.md' ? '' : rel.replace(/\.md$/, ''))
}

function buildRss(srcDir: string, outDir: string) {
  const feed = new Feed({
    title: 'BIM 问题管理平台 · 文档更新',
    description: '文档页面的更新流。',
    id: `${SITE}/`,
    link: `${SITE}/`,
    language: 'zh-CN',
    feedLinks: { rss2: `${SITE}/rss.xml` },
    author: { name: 'lansn.net', link: SITE }
  })
  for (const md of collectMd(srcDir)) {
    const url = urlOf(md, srcDir)
    if (url === '/') continue
    feed.addItem({
      title: titleOf(md, url),
      id: `${SITE}${url}`,
      link: `${SITE}${url}`,
      date: statSync(md).mtime
    })
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'rss.xml'), feed.rss2(), 'utf8')
}

export default defineConfig({
  lang: 'zh-CN',
  base: BASE,
  title: 'BIM 问题管理平台',
  description: '面向建模阶段 BIM 工程师的问题管理平台 —— 单团队私有化部署，完整 REST API 与个人 Token，让 AI 批量处理问题。',
  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo-mark.svg` }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: '文档更新 RSS', href: `${BASE}rss.xml` }]
  ],

  // hostname 结尾的斜杠是必需的：VitePress 内部用 new URL(相对路径, hostname) 组装，
  // 少了斜杠 hostname 的最后一段（Pages 的 /仓库名）会被当成文件名丢掉。
  sitemap: { hostname: `${SITE}/` },

  async buildEnd(siteConfig?: { srcDir?: string, outDir?: string }) {
    // VitePress 会以 siteConfig 调一次，转交给 Vite 的那次不带参数 —— 两种都要能跑
    const srcDir = siteConfig?.srcDir ?? join(HERE, '..')
    const outDir = siteConfig?.outDir ?? join(HERE, 'dist')
    buildRss(srcDir, outDir)
  },

  themeConfig: {
    siteTitle: false,
    logo: { light: '/logo-list-twin.svg', dark: '/logo-list-twin-dark.svg', alt: 'BIM 问题管理平台' },

    socialLinks: [
      {
        ariaLabel: 'Gitee 仓库',
        link: 'https://gitee.com/ameba-h/bim-issue-platform',
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 89.71 89.71" fill-rule="evenodd"><circle id="Combined-Shape" fill="#C71D23" cx="44.8544363" cy="44.8544363" r="44.8544363"></circle><path d="M67.558546,39.8714292 L42.0857966,39.8714292 C40.8627004,39.8720094 39.8710953,40.8633548 39.8701949,42.0864508 L39.8687448,47.623783 C39.867826,48.8471055 40.8592652,49.8390642 42.0825879,49.8393845 C42.0827874,49.8393846 42.0829869,49.8393846 42.0831864,49.8387862 L57.5909484,49.838657 C58.8142711,49.8386283 59.8059783,50.830319 59.8059885,52.0536417 C59.8059885,52.0536479 59.8059885,52.053654 59.8059701,52.0536602 L59.8059701,52.6073539 L59.8059701,52.6073539 L59.8059701,53.161115 C59.8059701,56.8310831 56.8308731,59.80618 53.160905,59.80618 L32.1165505,59.80618 C30.8934034,59.806119 29.9018373,58.8145802 29.9017425,57.5914331 L29.9011625,36.5491188 C29.9008781,32.8791508 32.8758931,29.9039718 36.5458611,29.9038706 C36.5459222,29.9038706 36.5459833,29.9038706 36.5460443,29.9040538 L67.5523638,29.9040538 C68.77515,29.9026795 69.7666266,28.9118177 69.7687593,27.6890325 L69.7721938,22.1516997 C69.774326,20.928378 68.7832423,19.9360642 67.5599198,19.9353054 C67.5594619,19.9353051 67.5590039,19.935305 67.558546,19.9366784 L36.5479677,19.9366784 C27.3730474,19.9366784 19.935305,27.3744208 19.935305,36.549341 L19.935305,67.558546 C19.935305,68.7818687 20.927004,69.7735676 22.1503267,69.7735676 L54.8224984,69.7735676 C63.079746,69.7735676 69.7735676,63.079746 69.7735676,54.8224984 L69.7735676,42.0864509 C69.7735676,40.8631282 68.7818687,39.8714292 67.558546,39.8714292 Z" id="G" fill="#FFFFFF"></path></svg>'
        }
      }
    ],

    nav: [
      { text: '首页', link: '/' },
      { text: '开始', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: '使用', link: '/use/user-guide', activeMatch: '/use/' },
      { text: 'MCP 接入', link: '/mcp/access', activeMatch: '/mcp/' },
      { text: '参考', link: '/reference/api', activeMatch: '/reference/' },
      { text: '设计', link: '/design/architecture', activeMatch: '/design/' },
      { text: '开发', link: '/dev/development', activeMatch: '/dev/' },
      { text: '下载绿色包', link: 'https://gitee.com/ameba-h/bim-issue-platform/releases#release-Windows%E7%BB%BF%E8%89%B2%E7%89%88v1.0' }
    ],

    sidebar: {
      '/guide/': [
        { text: '开始', items: [
          { text: '项目介绍', link: '/guide/introduction' },
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '配置与部署', link: '/guide/configuration' }
        ] }
      ],
      '/use/': [
        { text: '使用', items: [
          { text: '使用手册', link: '/use/user-guide' }
        ] }
      ],
      '/mcp/': [
        { text: 'MCP 接入', items: [
          { text: '接入与通道口径', link: '/mcp/access' },
          { text: '工具清单（17 个）', link: '/mcp/tools' }
        ] }
      ],
      '/reference/': [
        { text: '参考', items: [
          { text: 'API 契约', link: '/reference/api' },
          { text: '数据库设计', link: '/reference/database' }
        ] }
      ],
      '/design/': [
        { text: '设计', items: [
          { text: '架构与技术选型', link: '/design/architecture' },
          { text: '设计决策记录', link: '/design/decisions' }
        ] }
      ],
      '/dev/': [
        { text: '开发', items: [
          { text: '开发者指南', link: '/dev/development' }
        ] }
      ]
    },

    outline: { level: [2, 3], label: '本页目录' },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清空',
            backButtonTitle: '关闭',
            noResultsText: '没有匹配的结果',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },

    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新',
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',

    footer: {
      copyright: '© 2026 过河卒子 · lansn.net · ICP 备案号待备案通过后填入'
    }
  }
})
