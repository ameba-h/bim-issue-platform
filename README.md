# BIM 问题管理平台 · 文档站

VitePress 静态文档站的源码。线上地址：**https://bim.lansn.net**

平台本身的代码与绿色免安装包在 **[gitee.com/ameba-h/bim-issue-platform](https://gitee.com/ameba-h/bim-issue-platform)**；本仓库只放文档，不含应用代码。

## 内容

正文在 `docs/` 下，按读者的动线分五组，导航与侧栏见 `docs/.vitepress/config.mts`：

| 目录 | 给谁看 |
|---|---|
| `docs/guide/` | 决定要不要用、第一次跑起来 |
| `docs/use/` | 已经在用，查怎么操作 |
| `docs/reference/` | 接口、字段、表结构、错误码 |
| `docs/design/` | 为什么这么设计 |
| `docs/dev/` | 改代码的人 |

## 本地跑

```bash
pnpm install
pnpm docs:dev        # http://localhost:5173
pnpm docs:build      # 产物在 docs/.vitepress/dist
pnpm docs:preview
```

## 发布

推 `main` 触发 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，产物发到 GitHub Pages。**Pages 的 Build and deployment 来源必须是 GitHub Actions**；选 Deploy from a branch 会绕过构建，直接把 VitePress 源码当静态文件发出去。

站点根地址由 `SITE_URL` 环境变量决定（`docs/.vitepress/config.mts`），`base`、sitemap、RSS 里的绝对地址都从它推导，换域名不用改代码。

## 许可

MIT。前端基座派生自 [nuxt-ui-templates/dashboard](https://github.com/nuxt-ui-templates/dashboard)（MIT，Copyright (c) 2025 Nuxt UI Templates），按其许可要求保留该归属声明。
