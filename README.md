# BIM 问题管理平台

面向**建模阶段 BIM 工程师**的问题管理平台 —— 单团队私有化部署，并提供 API / MCP 接口，让 AI 能批量化处理问题。

> **状态：开发中。** 第一版（MVP）目标 = **7 个页面 · 14 张表 · 58 个接口端点**；当前数据层与设计文档已就绪，接口按批次实现中。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | **Nuxt 4**（全栈 + SPA，`ssr: false`） |
| 界面 | **Nuxt UI v4** |
| 数据库 | **SQLite（默认，零配置）** · **MySQL**（多人共用同一开发库时用） |
| ORM | **Drizzle ORM** —— 走 Node 内置 `node:sqlite` |
| 鉴权 | `nuxt-auth-utils`（sealed 加密 Cookie 会话） |
| 运行时 | **Node.js 22** + **pnpm 11** |

**为什么刻意不引任何原生依赖**：使用与部署这个平台的人是 **BIM 工程师，不是运维** —— 装不上 = 平台等于不存在。所以**禁用一切需要本地编译的模块**（如 `better-sqlite3`），SQLite 一律走 Node 内置的 `node:sqlite`。

## 快速开始（SQLite 单机 · 推荐）

> 前置：Node.js ≥ 22 + pnpm 11。全程**零原生依赖**，不需要编译工具链。

```bash
# 1 · 克隆 + 依赖
git clone <仓库地址> && cd bim-issue-platform
pnpm install

# 2 · 配置（.env 已在 .gitignore 中，不会入库）
cp .env.example .env
```

⚠️ 然后**手改 `.env` 两行**（`.env.example` 是按内部 MySQL 开发库写的模板，默认值不适合单机试用）：

```env
DATABASE_CLIENT=sqlite                                          # ← 必须改成 sqlite
NUXT_SESSION_PASSWORD=<一个 ≥32 字符的随机串>                    # ← 替换占位符
# 生成随机串：node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
# 3 · 建库 —— 建表后自动创建默认管理员（admin / admin5555，幂等）
pnpm db:init                # SQLite 建到 data/bim_issue.db（该目录不入库，克隆后本来就没有）

# 3b · （可选）灌演示数据：6 个角色账号 + 4 个虚构项目 + 预置问题
pnpm db:seed-demo           # 先加 -- --dry-run 可预览；演示账号口令统一 Demo@2026
#    💡 仓库自带演示库 data/bim_issue_demo.db（已灌好上面的数据）——
#       想直接带数据试跑：在 .env 加 DATABASE_FILE=./data/bim_issue_demo.db，跳过第 3/3b 步

# 4 · 起服务
pnpm dev                    # http://localhost:5555

# 5 · 登录
#    默认管理员：admin / admin5555（库里已有平台管理员则跳过创建）
#    ⚠️ 首次登录后请立即改密。忘记口令：pnpm user:create --username admin --reset-password
#    想自定义首个管理员（换账号名 / 口令）：用下面这条，交互式录入、口令不回显
pnpm user:create
```

> **多人共用一个 MySQL 开发库**（内部同学）：`.env` 保留 `DATABASE_CLIENT=mysql` 并填好
> `DATABASE_HOST/NAME/USERNAME/PASSWORD`，建库改用 `pnpm db:init:mysql`，其余步骤相同。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` · `build` · `preview` | 开发 / 构建 / 预览 |
| `pnpm lint` · `typecheck` | 代码规范 / 类型检查 |
| `pnpm db:generate[:mysql]` | 由 `schema.ts` 生成迁移 SQL |
| `pnpm db:migrate` | 执行迁移 |
| `pnpm db:check` | **对拍四份表结构定义**（改了表结构必跑） |
| `pnpm db:seed-tags` | 给项目补灌 41 项标准分类（`--project <ID>` / `--all` / `--dry-run`；只补缺、不改不删） |
| `pnpm user:create` | **建账号 / 重置口令**（`--reset-password` 改已存在账号的口令）；`--dry-run` 可先看会做什么 |
| `pnpm doc:check` | 全项目禁用字符自检 |
| `pnpm check:all` | **一次跑完**：类型检查 + 代码规范 + 禁用字符 + 表结构对拍 |

## 自动检查（提交 / 推送时）

用 **git 钩子**做本地门禁（配置在 `.githooks/`，仓库已设 `core.hooksPath`）：

| 时机 | 跑什么 | 耗时 |
|---|---|---|
| **提交前** `pre-commit` | 禁用字符自检 + 四份表结构定义对拍 | 秒级 |
| **推送前** `pre-push` | 类型检查 + 代码规范 + 上面两项（即 `pnpm check:all`） | 数十秒 ~ 2 分钟 |

想手动跑完整检查：`pnpm check:all`。紧急情况下可以 `git commit --no-verify` / `git push --no-verify` 跳过（**不推荐**）。

> **为什么不用云 CI？** Gitee Go 的 Node 构建插件基础镜像是 CentOS 7.6、Node 最高约 15 ~ 17，而本项目要求 **Node 20+**（Nuxt 4）与 **22**（`node:sqlite`）—— 跑不起来。故把门禁放在本地：效果等效，而且**比云 CI 拦得更早**（提交时就拦，不用等推上去）。

> ⚠️ **改了 `server/database/schema*.ts` 的写法后，务必跑一次 `pnpm db:check`。** 该脚本用文本解析读 `schema.ts`，对写法敏感 ——
> 已知踩点：`(t) => [...]` 这种回调若被改写成别的形式，索引会被静默漏读（表现为「整表索引凭空消失」）。脚本已放宽为兼容 `(t) =>` 与 `t =>` 两种写法，但新增写法仍可能不被识别。

## 目录结构与所有权

单仓库、多角色并行开发，故目录所有权先划清：

| 目录 | 归属 | 权限 |
|---|---|---|
| `app/`（页面 / 组件 / 组合式函数 / 工具） | 前端 | **只由前端改** |
| `server/`（接口 / 鉴权 / 数据库） | 后端 | **只由后端改** |
| `shared/` | 前后端共用 | **只能新建、不能删除** |
| `scripts/` | 待定 | —— |

> 审查方对整个仓库**只读**：审查意见只写进自己新建的 Markdown 文件，不改任何既有文件。

## 文档

设计文档统一放在 **`docs/`**（根目录只留本 README）—— **接口字段 / 错误码 / 路径一律以《接口契约》为唯一事实来源**：

| 文档（`docs/` 下） | 内容 |
|---|---|
| `1_需求与进度.md` | 决策日志（只追加） |
| `2_业务规则.md` | 权限矩阵 · 状态机 · 事务与一致性 |
| `3_数据库设计.md` | 表结构（真源是 `server/database/schema.ts`） |
| `4_页面设计.md` | 页面 / 交互 / 路由 |
| `5_1前端架构.md` | 目录所有权 · 取数 · 判权 · 状态管理 |
| `5_2前端现状与待办.md` | 前端进度与待办（前端负责人维护） |
| `6_1接口清单.md` | 58 端点速查 + 实现状态核对 |
| `6_2接口契约.md` | **前后端并行开发的唯一接口依据** |
| `7_1评审建议.md` | 历次评审结论 |
| `7_2校审建议.md` | 审查人意见（审查人维护） |
| `8_演示账号清单.md` | 演示账号与演示项目角色矩阵 |
| `数据库ER图.drawio` | 实体关系图（用 draw.io / VS Code Draw.io 插件打开；**唯一有效版本**） |
| `技术栈版本文档/` | 依赖官方文档快照（nuxt / vue / drizzle / nuxt-ui / zod / vueuse …，约 14 MB），离线查阅用。⚠️ **第三方文档，仅内部使用 —— 仓库转公开前必须删除该目录**（门禁已排除，不参与 lint 与字符自检） |

> **文档改过名（2026-09-23）**：原先 7 份文档在根目录、文件名前缀为 `BIM问题管理平台_`。老文档里的历史记录仍可能用旧名，对照关系：
> `BIM问题管理平台_需求与进度.md` → `docs/1_需求与进度.md` · `_业务规则` → `2_业务规则` · `_数据库设计` → `3_数据库设计` · `_页面设计` → `4_页面设计` · `_前端架构` → `5_1前端架构` · `_接口契约` → `6_2接口契约` · `_评审建议` → `7_1评审建议` · `ER图-2.drawio` → `docs/数据库ER图.drawio`。

## 许可与致谢

- **License**：MIT（见 `LICENSE`）
- **前端基座**：派生自 [nuxt-ui-templates/dashboard](https://github.com/nuxt-ui-templates/dashboard)（MIT License，Copyright (c) 2025 Nuxt UI Templates）—— 按其许可要求保留此归属声明。
