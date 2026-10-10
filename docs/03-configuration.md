# 配置与部署

## 环境变量（`.env`）

以 `.env.example` 为模板复制为 `.env`（不入库）。全部变量：

### 运行环境

| 变量 | 默认 | 说明 |
|---|---|---|
| `NODE_ENV` | `development` | 运行环境 |
| `APP_PORT` | `3000` | 服务端口（开发模式另见 `nuxt.config.ts` 的 `devServer.port` = 5555） |

### 数据库

| 变量 | 说明 |
|---|---|
| `DATABASE_CLIENT` | `sqlite`（默认推荐）/ `mysql`。模板里默认 `mysql`，单机试用请改 `sqlite` |
| `DATABASE_FILE` | SQLite 模式的库文件路径，如 `./data/db/bim_issue.sqlite` |
| `DATABASE_HOST` / `DATABASE_PORT` | MySQL 连接地址与端口 |
| `DATABASE_NAME` | 库名 |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | MySQL 账号。密码含 `#`、空格等特殊字符时**必须用双引号包裹**（不加引号会被当行内注释截断） |

**凭据红线**：真实口令 / 连接信息只存本地 `.env`；仓库（含文档、脚本、源码）一律不留明文，脚本中只用 `__DB_PASSWORD__` 占位符。若部署到公网或共享环境，请务必使用强口令。

### 会话

| 变量 | 说明 |
|---|---|
| `NUXT_SESSION_PASSWORD` | `nuxt-auth-utils` 会话加密密钥，**≥32 字符**随机串。缺失或过短会话无法建立 |

### 应用密钥（如模板中存在）

| 变量 | 说明 |
|---|---|
| `AUTH_SECRET` | 预留占位，见 `.env.example` 注释 |

## 数据库选择

### SQLite（默认，推荐单机 / 小团队）

- 零配置，一个文件即一个库（`data/` 目录），备份 = 拷文件；
- 走 Node 22 内置 `node:sqlite` 驱动，**无任何原生编译依赖**；
- WAL 模式支持「多读单写」，十几人团队的并发完全够用；
- **注意**：SQLite 是单文件单机库，**不要**把 `.db` 文件放在网络共享盘上让多人同时写 —— 网络文件系统的文件锁不可靠，可能锁库甚至损坏文件。多人共用请用 MySQL。

### MySQL（多人共享 / 接入既有基础设施）

- 面向 8.0+ 设计（开发验证环境为 MySQL 8.0.40），字符集 `utf8mb4`；
- 建库用 `pnpm db:init:mysql`（需要先手工建库与账号，见 `scripts/db/00_init_database.sql` —— 幂等脚本，含建库 / 建账号 / 授权 / 校验四段）；
- 应用账号建议**只授予本库权限**（全局仅 `USAGE`），不要用 root 连库。

### 切换与迁移

两库共用同一套 Drizzle schema（`server/database/schema.ts` / `schema.mysql.ts`）与迁移脚本，切换只需改 `DATABASE_CLIENT`。表结构变更流程见 [06-database.md](./06-database.md)。

## 初始化命令

| 命令 | 作用 |
|---|---|
| `pnpm db:init` | SQLite 建库 + 建表 + 自动创建默认管理员（幂等） |
| `pnpm db:init:mysql` | MySQL 建表 + 自动创建默认管理员（幂等） |
| `pnpm db:migrate` | 执行未应用的迁移 |
| `pnpm db:seed-tags` | 给项目补灌 41 项标准分类（`--project <ID>` / `--all` / `--dry-run`；只补缺、不改不删） |
| `pnpm db:seed-demo` | 灌演示数据（`--dry-run` 预览） |

## 部署形态

### 局域网部署（最常见）

1. 一台常开的主机 / 服务器（Windows 或 Linux 均可），安装 Node 22 + pnpm；
2. 按快速开始完成安装与建库；
3. `pnpm build && pnpm preview`（或用进程管理器常驻，见下）；
4. 同事浏览器访问 `http://<内网IP>:<端口>`。

### 外网部署

- 强烈建议套 HTTPS：登录口令与 API Token 都是明文过网，纯 HTTP 下有被窃听风险；
- 用 Nginx / Caddy 反向代理做 TLS 终结即可（应用本身同源，无跨域需求）；
- 若用 Nginx，注意放宽 `client_max_body_size`（建议 220m，略高于单文件 200 MB 上限）。

### 进程常驻

- **Windows**：计划任务 / NSSM 注册为服务 / 启动项脚本均可；
- **Linux**：`systemd` unit 或 `pm2`。

> 注意：使用平台的人是 BIM 工程师而非运维 —— 部署脚本务必做成「关掉窗口服务也不停」或随系统自启，否则工程师顺手关掉终端窗口，平台就下线了且无人知晓。

## 数据目录与备份

```
data/
├─ bim_issue.db                  # SQLite 库（DATABASE_CLIENT=sqlite 时）
├─ uploads/<项目ID>/             # 按项目分层的文件存储
│   ├─ issues/YYYY/MM/<记录ID>.webp   # 问题截图
│   ├─ thumbs/<记录ID>.png            # 缩略图（不入库，按记录 ID 推导）
│   ├─ attach/YYYY/MM/<记录ID>.<ext>  # 过程附件
│   ├─ models/<记录ID>.ifc            # BIM 模型（暂缓展示，可上传存储）
│   └─ cover/<记录ID>.<ext>           # 项目封面
├─ avatars/<用户ID>.<ext>        # 用户头像
└─ exports/                      # 导出产物（带 TTL，定时任务清理）
```

**备份要点**：

- **数据库与 `data/uploads/` 必须成套备份**，只备 `.db` 等于没备（文件本体不在库里，库里只有元信息）；
- 目录第一层就是项目 ID，可按项目粒度备份 / 迁移；
- 路径使用内部不可变 ID（ULID）而非项目编号 —— 项目改名 / 编号复用不影响已存文件；
- **本项目任何角色、任何通道都不物理删除文件**（软删 = 永久保留，回溯优先），定时任务只清理上传中断的 `tmp/*.part` 半截文件与「磁盘有、库里无」的真孤儿。

## 安全清单（上线前过一遍）

- [ ] 修改默认管理员口令 `admin5555`；
- [ ] `NUXT_SESSION_PASSWORD` 使用 ≥32 字符随机串（不要用示例值）；
- [ ] 外网部署套 HTTPS；
- [ ] MySQL 部署时应用账号仅授予本库权限、不暴露公网；
- [ ] `.env` 不进版本库（已在 `.gitignore`，确认部署流程也不会带出去）；
- [ ] `uploads/` 目录不被静态暴露（应用内所有文件访问都过接口鉴权，不要额外配静态目录映射）。
