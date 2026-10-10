# 开发者指南

## 环境搭建

前置：Node.js ≥ 22 + pnpm 11（本项目 `packageManager` 固定为 `pnpm@11.6.0`；**Windows 下若遇 pnpm 自动切换版本报错，确认本机版本与该字段一致即可**）。

```bash
pnpm install
cp .env.example .env     # 单机开发改 DATABASE_CLIENT=sqlite
pnpm db:init             # 建库（SQLite）+ 自动建 admin
pnpm db:seed-demo        # 可选：演示数据
pnpm dev                 # http://localhost:5555
```

> `pnpm-workspace.yaml` 中固定了 `nodeLinker: hoisted`（npm 风格扁平布局）。这是为规避 Windows + 特定路径组合下 pnpm isolated 软链建链失败的坑而设，**请勿删除**（`pnpm-lock.yaml` 与它必须随仓库走）。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` / `build` / `preview` | 开发 / 构建 / 预览 |
| `pnpm lint` · `typecheck` | 代码规范（`eslint --max-warnings=0` 口径）/ 类型检查 |
| `pnpm db:generate`(:mysql) | 由 schema 生成迁移 SQL |
| `pnpm db:migrate` | 执行迁移 |
| `pnpm db:check` | **四份表结构定义对拍**（改了表结构必跑） |
| `pnpm db:seed-tags` | 给项目补灌 41 项标准分类（只补缺、不改不删） |
| `pnpm db:seed-demo` | 灌演示数据（`--dry-run` 预览） |
| `pnpm user:create` | 交互式建账号 / 重置口令（`--username x --reset-password`；`--dry-run` 预览） |
| `pnpm doc:check` | 全项目禁用字符自检（带圈数字、节符等小字符） |
| `pnpm check:all` | **一次跑完**：typecheck + lint + doc:check + db:check |

## 代码门禁（git 钩子）

配置在 `.githooks/`（仓库已设 `core.hooksPath`），本地即门禁：

| 时机 | 跑什么 |
|---|---|
| `pre-commit` | 禁用字符自检 + 四份表结构对拍（秒级） |
| `pre-push` | typecheck + lint + 上面两项（即 `check:all`） |

> 不用云 CI 的原因：目标托管平台（Gitee Go）的构建镜像 Node 版本过低，跑不动 Nuxt 4 + `node:sqlite`；本地门禁效果等效且拦截更早。紧急情况可 `--no-verify` 跳过（不推荐）。

## 目录结构与协作约定

| 目录 | 归属 |
|---|---|
| `app/`（页面 / 组件 / composables / 工具） | 前端 |
| `server/`（API / 鉴权 / 数据库） | 后端 |
| `shared/`（前后端共用类型） | **只能新建、不能删除**（删掉会连带另一边编译失败；确需移除先协商） |
| `scripts/db/` | 后端工具；`scripts/doc/`、`scripts/user/` 通用 |
| `docs/*.md` | 谁主张谁改，提交信息里写明 |

单人维护时这些边界自然消解，但两条工程纪律建议保留：

1. **接口看契约** —— 不自己发明字段名 / 错误码 / 路径；字段与语义变更必须先改 `docs/6_2接口契约.md` 再动代码；
2. **权限 / 状态机只认《业务规则》**（`docs/2_业务规则.md`），**表结构以 `schema.ts` 为准**，各文档分工见其标头。

## 代码规范要点（来自契约的审查必查项）

| # | 规则 | 为什么 |
|---|---|---|
| 1 | 前端不得按 `message` 文字判分支（只认 `error.code`） | 文案随时优化，靠文案判分支会静默失效 |
| 2 | 业务 SQL 的 `WHERE` 必须带 `project_id`；禁止「先按 id 查出来再判断归属」的两步式 | 跨项目越权唯一的入口防线 |
| 3 | 权限判断只走 `server/utils/authz.ts`，禁止路由里散写 `role ===` | 散写必然出现「页面拦住了、接口没拦」 |
| 4 | 调批量接口必须读 `failed` / `results[]`，不能只看 HTTP 200 | 部分成功照常返回 200 |
| 5 | 写接口的七步顺序不可调换（见 05-architecture）；写库与写留痕同事务 | 「数据改了、留痕没写」比不改更糟 |
| 6 | 枚举一律 `VARCHAR + CHECK`，时间读写过 `server/database/time.ts` | 双方言兼容 |

前端侧补充：页面不写裸角色比较（走 `utils/permission.ts`）；接口类型只出自 `shared/types/`；取数只经 `useApi`（唯一例外是 `nuxt-auth-utils` 自身的会话端点与 `/api/auth/*`）；一个列表只有一个取数触发点（`useAsyncList` 的 getter）。

## 依赖纪律

**纯 JS 允许，需要本地编译的原生模块禁止。** 现有等价物：

| 需求 | 用 | 不用（原生） |
|---|---|---|
| SQLite | Node 22 内置 `node:sqlite` | better-sqlite3 |
| 密码哈希 | 内置 `crypto.scrypt` | bcrypt / argon2 |
| 图像处理 / 缩略图 | jimp（纯 JS） | sharp |
| WebP 编解码 | @jsquash/webp（WASM，本地加载） | — |
| 打包 / Excel / Word | fflate / exceljs / docx | — |

新增依赖前先问：内网无外网环境装不装得上？双平台（Linux / Windows）都免编译吗？

## 测试与验证

- 表结构：`pnpm db:check`（四份定义对拍：列 / 索引 / 外键 / CHECK 逐项比对）；
- 冒烟：`scripts/db/smoke_test.ts`（建库后可跑的基础链路验证）；
- 类型与风格：`pnpm typecheck && pnpm lint`；
- **未注册组件这类错误 typecheck 查不出来**（Vue 运行时才报），界面改动请实际打开浏览器点一遍 —— 本项目开发过程中「静态全绿但点了才知道坏」的案例不止一次（如 `UButtonGroup` 在 Nuxt UI v4 中已改名 `UFieldGroup`、`<label>` 包按钮导致点击不弹文件框）。

## 已知坑（少走弯路）

- `pnpm-workspace.yaml` 的 `nodeLinker: hoisted` 与 `pnpm-lock.yaml` 必须随仓库走（见上）；
- 改 `schema*.ts` 后必跑 `pnpm db:check` —— 文本解析对写法敏感，`(t) =>` 回调被改写形式会静默漏读索引；
- MySQL 开发库重建须先手工 DROP 全表（`CREATE TABLE IF NOT EXISTS` 不会应用新 DDL）；
- `.env` 的 `DATABASE_PASSWORD` 含 `#` 等字符时必须双引号包裹；
- Nuxt UI v4 与 v3 组件名差异大（`UButtonGroup` → `UFieldGroup` 等），写组件前对照 `node_modules/@nuxt/ui` 实际导出；
- `UDropdownMenu` 的搜索框用 `:filter` prop 而非 `#header` 插槽（插槽在 v4 渲染为空注释）；
- `UTable` 定宽列必须配 `min-w`（`table-layout: auto` 下只写 `w-`/`max-w-` 会被 `w-full` 列挤回最小内容宽）；
- Git Bash 下用 curl 传中文 JSON 会被 Windows 代码页转成乱码 —— **body 一律走 UTF-8 文件**（`curl --data-binary @file.json`）。

## 文档结构说明

- `docs_2/`（本目录）：面向使用者的整理版文档；
- `docs/`：项目全程的过程记录 —— 需求决策日志（只追加）、业务规则、数据库 / 页面 / 前端架构设计、接口契约（唯一事实来源）、历次评审与校审意见、前后端对接记录。查阅历史决策来龙去脉时非常有用，但**过程状态（已完成 / 已划掉）不代表当前代码状态**，以代码与本目录为准；
- `docs/技术栈版本文档/`：Nuxt / Drizzle 等依赖的官方文档离线快照（约 14 MB），**第三方资料、不属于本项目**，仅供离线查阅。
