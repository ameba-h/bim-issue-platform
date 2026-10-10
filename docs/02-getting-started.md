# 快速开始

> 前置要求：**Node.js ≥ 22**（需要内置 `node:sqlite`）+ **pnpm 11**。全程零原生依赖，不需要 C++ 编译工具链。

## 1 · 克隆与安装

```bash
git clone <仓库地址> && cd bim-issue-platform
pnpm install
```

## 2 · 配置

```bash
cp .env.example .env
```

`.env` 不会入库（已在 `.gitignore` 中）。单机试用只需确认 / 修改两行：

```env
DATABASE_CLIENT=sqlite                              # 默认模板是 mysql，单机试用请改为 sqlite
NUXT_SESSION_PASSWORD=<一个 ≥32 字符的随机串>        # 替换占位符
```

生成随机串：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> 完整配置项说明见 [03-configuration.md](./03-configuration.md)。

## 3 · 建库

```bash
pnpm db:init
```

SQLite 模式建库到 `data/bim_issue.db`，并在建表后**自动创建默认管理员**（幂等 —— 库里已有平台管理员则跳过）：

| 账号 | 口令 | 说明 |
|---|---|---|
| `admin` | `admin5555` | 平台管理员。⚠️ 首次登录后请立即改密 |

忘记口令时重置（交互式录入，不进 shell 历史）：

```bash
pnpm user:create --username admin --reset-password
```

想自定义首个管理员（换账号名 / 口令）：

```bash
pnpm user:create
```

## 4 · （可选）灌入演示数据

```bash
pnpm db:seed-demo                # 先加 -- --dry-run 可预览
```

演示数据包含：6 个虚构角色账号（口令统一 `Demo@2026`）+ 4 个虚构项目（每个自动初始化 41 项标准分类）+ 预置问题 / 答复 / 留痕，用于体验完整的角色权限差异。

| 账号 | 姓名 | 在「云璟商业中心」里的角色 |
|---|---|---|
| `demo_wangcy` | 王重阳 | 项目负责人 |
| `demo_qiaof` | 乔峰 | 土建专业负责人 |
| `demo_dongfbb` | 东方不败 | 机电专业负责人 |
| `demo_duany` | 段誉 | 工程师 |
| `demo_zhaom` | 赵敏 | 甲方 |
| `demo_yuebq` | 岳不群 | 协同方 |

> 演示账号与项目全部虚构，仅用于演示 / 测试；生产环境不会有这些账号。完整角色矩阵见 [04-user-guide.md](./04-user-guide.md)。

## 5 · 启动

```bash
pnpm dev            # http://localhost:5555
```

开发端口固定为 5555（定义在 `nuxt.config.ts`）。登录后请先改掉默认口令。

## 6 · 生产构建

```bash
pnpm build
pnpm preview        # 预览构建产物
```

> 鉴权模块要求保留 Nitro 服务器（`nuxt build`），**不支持** `nuxt generate` 纯静态导出 —— 本项目是 SPA（`ssr: false`）但服务端仍承担全部 API。

## 常见问题

**Q：启动时警告 `SQLite is an experimental feature`？**
正常。SQLite 驱动用的是 Node 22 内置的 `node:sqlite`（目前标记为实验特性），启动参数里已加 `--disable-warning=ExperimentalWarning` 压掉大部分警告，个别场景仍可能看到，不影响使用。

**Q：想直接用带数据的演示库？**
仓库自带 `data/bim_issue_demo.db`（已灌好演示数据）。在 `.env` 里加一行 `DATABASE_FILE=./data/bim_issue_demo.db`，跳过第 3 / 4 步直接启动。

**Q：团队要共用同一个开发库？**
改用 MySQL：`.env` 保持 `DATABASE_CLIENT=mysql` 并填好连接信息，建库命令换成 `pnpm db:init:mysql`，其余步骤相同。详见 [03-configuration.md](./03-configuration.md)。

**Q：端口 5555 被占了？**
Nuxt 会自动顺延到下一个可用端口（以启动日志为准）；或修改 `nuxt.config.ts` 的 `devServer.port`。
