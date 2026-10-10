# 数据库设计

> 表结构的真源是 `server/database/schema.ts`（SQLite）/ `schema.mysql.ts`（MySQL），本文是带中文说明的速览。ER 关系图见 `docs/数据库ER图.drawio`（draw.io 打开）。

## 总览（14 张表）

| # | 表名 | 中文名 | 一句话用途 |
|---|---|---|---|
| 1 | `users` | 用户表 | 人 + AI 都在这里，靠 `subject_type` 区分 |
| 2 | `projects` | 项目表 | 名称 / 系统编号 / 封面 / 取号计数器 / 设置 JSON |
| 3 | `project_members` | 项目成员表 | 某人在某项目里担任什么角色（软移出可复入） |
| 4 | `tags` | 分类类目表 | 四维度分类（类型 / 专业 / 专项 / 子项），41 项标准 seed |
| 5 | `issues` | 问题表 | **核心表** |
| 6 | `issue_tags` | 问题-类目关联表 | 多维多选，复合外键防跨项目 |
| 7 | `attachments` | 附件表 | 截图 + 过程附件同表，靠 `category` 区分 |
| 8 | `replies` | 答复表 | 只增不改不删 |
| 9 | `project_sections` | 项目说明表 | 概况 + 各专业设计说明（Markdown） |
| 10 | `project_metrics` | 经济技术指标表 | 一行一指标，可分组排序 |
| 11 | `audit_log` | 操作留痕表 | 谁在何时把哪个字段从什么改成什么 |
| 12 | `idempotency_key` | 幂等键表 | 批量写入防重复 |
| 13 | `model_files` | BIM 模型文件表 | IFC 文件，重传 = 新增版本（展示暂缓，存储可用） |
| 14 | `api_token` | 个人 API 令牌表 | 一人一枚，只存哈希 |

```
projects（根，一切按项目隔离）
  ├─ project_members / tags / project_sections / project_metrics / model_files
  └─ issues ─┬─ issue_tags（↔ tags 多对多）
             ├─ attachments（可再挂到某条答复下）
             └─ replies
users ── 贯穿所有表（创建人 / 执行人 / 上传人 / 操作主体，含 AI）
users ── api_token（一人一枚）
audit_log + idempotency_key ── 兜住全量留痕与 AI 批量写入防重
```

## 通用约定（14 张表统一遵守）

| 约定 | 内容 | 为什么 |
|---|---|---|
| 主键 | 全库统一 `CHAR(26)` 的 **ULID** | 时间有序、跨库搬家不用重编号、外部无法枚举数据量 |
| 表名 | 一律复数 | 统一 |
| 枚举 | `VARCHAR + CHECK` 约束，**不用 MySQL 原生 ENUM** | 保证 SQLite / PostgreSQL 兼容；加取值只改代码常量、不用发迁移 |
| 时间 | 库里存 UTC（SQLite `TEXT` ISO8601 / MySQL `DATETIME(3)`），读写统一过 `server/database/time.ts` | 两库存储形态不同，统一转换只放一处 |
| 软删 | 需要可回溯的表用 `deleted_at`（NULL = 未删） | 与全量留痕一致，兜住误删 |
| 跨项目防护 | 子表冗余存 `project_id` 并参与复合外键 | 数据库自己拦跨项目写入，不靠代码记得查 |
| 字符集 | MySQL 侧 `utf8mb4` / `utf8mb4_0900_ai_ci`，InnoDB | 中文与 emoji |
| 变更方式 | 迁移脚本 + ORM 抽象，**禁手改表** | 多人同库的底线 |

**复合外键的辅助唯一索引**：SQLite 要求外键指向的列有唯一索引，因此 `issues` / `tags` / `replies` 各带一个 `UNIQUE(id, project_id)`（或 `UNIQUE(id, issue_id)`）辅助索引 —— 看似多余，实为让「跨项目防护」在 SQLite 下也生效。

## 核心表要点

### `users`

- `subject_type`：`human` / `ai`。**AI 也是这张表的一行**（全局一个「AI 助手」账户：无 username、无口令、不能登录、不加入项目，只作为 `X-Agent-Id` 的留痕主体）；
- `role`：平台级角色（`platform_admin` / `user`）。**项目内角色不在这张表**；
- `status`：`active` / `disabled`。离职或误建**只停用、不删号**（删了会连坐他提的问题与答复）；
- `current_project_id`：当前项目上下文（服务端存储）。刻意**不设外键**（与 `projects.created_by` 互指会成环），由服务端校验成员资格；
- `password_hash`：Node 内置 `crypto.scrypt` 加盐哈希（bcrypt / argon2 是原生模块，违反依赖纪律）。

### `projects`

- `code`：对外编号，**系统生成 `YYYY-NNN`（年内三位序号）、不可改、不接受客户端传入** —— 它是导入对账的锚点；
- `issue_seq`：问题编号计数器，新增问题在同一事务内 `+1` 取号（杜绝 `MAX(number)+1` 的并发竞态）；编号 4 位、**超 9999 显式报错、删除留空号不复用**；
- `settings`：JSON 文本，当前只有 `{"ai_actions": [...]}`（AI 允许动作清单，白名单默认三项）。

### `project_members`

- 主键 `(project_id, user_id)`，天然防重复加入；
- `role` 六种取值：`project_owner` / `civil_lead` / `mep_lead` / `engineer` / `client` / `collaborator`。土建与机电专业负责人**权限完全相等系有意设定**（仅为称谓标识），鉴权归并为单一 lead 能力组；
- `removed_at`：软移出（不删行）。**移出后重新加入复用原行**（清空 `removed_at`）。

### `tags`

- `dimension`：`type` / `major` / `special` / `subitem`；`name` 含前缀（如 `专项-净高`）；
- **缩写唯一性是「维度内唯一」**：`UNIQUE(project_id, dimension, abbr)` —— 实际清单里 `JG` 同时是「专业-09景观」与「专项-01净高」的缩写，按项目唯一会直接撞车；
- 41 项标准分类（类型 3 + 专业 9 + 专项 26 + 子项 3）由 `server/database/standard-tags.ts` 定义（代码里仅此一份），**建项目时幂等 seed 41 行**；展示口径的「所有问题」（第 42 项）不入表，由接口 `systemItem` 回传；
- **类目一律不删除**（无删除接口）—— 建错的保留不用或改名复用；「问题数为 0」是未使用信号，不是删除许可。

### `issues`

- `number`：展示编号 `VARCHAR(4)`，项目内 `0001` 起；**不可当主键 / ID 用**；
- 位置信息拆两列：`drawing_version`（图纸版本日期，**为空 = 「缺位置」**，巡检目标）+ `grid_location`（轴网定位，可空不算缺）；
- `priority`：整数 1–4（1 紧急 / 2 普通 / 3 轻微 / 4 建议）；
- `source`：`human` / `ai` / `import` —— **这条数据是谁写的**，由通道决定、不由客户端传，记的是**创建时**的通道（AI 后续改写不改变它）；
- `executor_id`：执行人，**只有他能关闭 / 重开**；新建默认 = 创建人，为空仅见于导入数据。

### `attachments`

- `category`：`shot` 截图 / `attach` 过程附件，**一张表管所有文件**；截图与过程附件处理路径完全不同（压缩转 WebP + 缩略图 vs 原样存只下载）；
- `issue_id` 非空（附件强关联问题），`reply_id` 可空（答复里贴的图填对应答复）；
- `file_hash`（SHA256）只作**完整性校验与孤儿比对**，不承担去重（去重已放弃：文件名 = 记录 ID，每条记录独立存一份）；
- 缩略图不入库（按 `issues/` → `thumbs/` 同名路径推导）；
- **问题软删时附件一并软删，磁盘文件一律不物理删除**（回溯优先）。

### `replies`

只增不改不删（说错了再发一条更正）—— 不加 `updated_at` / `deleted_at`，数据干净且留痕天然成立。

### `audit_log`（留痕）

三个身份字段是全库最关键的设计：

| 字段 | 含义 | 人直连 | AI 代理执行 |
|---|---|---|---|
| `actor_id` | **实际操作者**（谁的手动了数据），永远有值 | 人 | AI |
| `commander_id` | **发令人**（谁的权限生效），仅代劳关系有值 | NULL | 人 |
| `agent_id` | 代理执行的 AI，仅模式 A 有值 | NULL | AI |
| `channel` | 操作通道：`web` / `api` / `ai` | web / api | ai |

读法：**「谁做的」看 `actor_id`；「谁的权限生效」看 `commander_id`（为空则看 `actor_id` 自己的角色）**。`changes` 存字段级 JSON（`[{field, before, after}]`），**只记真变化的字段**（diff 为空不落行）；长正文列只记 `{changed, lengthBefore, lengthAfter}` 不存明文。`target_type` 十种：issue / reply / attachment / tag / member / project / metric / section / model / **user**（平台账号操作）。

### `idempotency_key`

`UNIQUE(actor_id, key)` —— 按**实际操作者**隔离幂等作用域（换人即另算）。存请求指纹（SHA256）与首次响应，重放且指纹相同 → 原样返回；指纹不同 → 409 拒绝。24 小时过期清理。`dryRun=true` 时不落键（否则「先预览再真跑」必然撞 409）。

### `api_token`

`token_hash` UNIQUE（SHA256，明文只在生成时展示一次）；`revoked_at` 为空 = 有效；**重置即吊销**（删旧插新），不做独立吊销流程。

## 不建的表（及理由）

| 不建 | 理由 |
|---|---|
| `session` 会话表 | `nuxt-auth-utils` sealed 加密 Cookie，无需服务端会话 |
| `notification` 通知表 | 站内通知未做；操作记录由 `audit_log` 承担 |
| `export_jobs` 导出任务表 | 带图导出为进程内后台任务 + 流式写盘，任务 ID 重启即失效 |
| `issue_participants` 参与人表 | 无用（创建人 / 执行人已覆盖） |
| 登录失败锁定相关表 | 未定案，定了再补 |

## 迁移与对拍

```bash
pnpm db:generate            # 由 schema.ts 生成 SQLite 迁移 SQL（drizzle-kit）
pnpm db:generate:mysql      # MySQL 侧
pnpm db:migrate             # 执行迁移
pnpm db:check               # 四份表定义对拍（改了表结构必跑）
```

- **改了 `server/database/schema*.ts` 后务必跑 `pnpm db:check`**：该脚本用文本解析读 schema，对写法敏感 —— 已知踩点：`(t) => [...]` 回调若被改写成别的形式，索引会被静默漏读（表现为「整表索引凭空消失」）；
- MySQL 开发库重建须先手工 DROP 全部表再 `pnpm db:init:mysql`（建表语句是 `CREATE TABLE IF NOT EXISTS`，改 DDL 不会自动生效）；
- 容量参考：单项目 1000 条问题 + 4000 张截图（压缩后）约 77 MB ~ 0.94 GB；表结构 / 索引 / 分页按「单项目 1 万条 × 100 项目」的峰值设计。
