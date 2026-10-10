# API 参考

> 权威契约是 `docs/6_2接口契约.md`（含逐端点请求 / 响应示例与变更记录）；本文是面向使用者的速查。项目级接口统一前缀 `/api/v1/projects/:projectId`，下表省略该前缀。

## 通用约定

| 项 | 约定 |
|---|---|
| 前缀 | 业务接口 `/api/v1`；登录 / 登出 `/api/auth/*`、会话 `/api/_auth/session` 不加前缀 |
| **projectId 强制进路径** | 所有业务接口路径必须含 `projectId`，不存在「只按 issueId 操作」的端点 |
| 成功响应 | 单资源 → 对象本身；列表 → `{ "items": [...], "page": { total, page, pageSize, totalPages } }`；状态码 200 / 201 / 204 |
| 失败响应 | `{ "error": { "code": "PERM_DENIED", "message": "中文文案", "details": {...} } }` —— **按 `code`（字符串常量）判分支**，不要解析 `message` 文字。⚠️ HTTP 404 也可能来自「路径写错」（无 `error.code`），判别先看响应体形状 |
| ID | 26 位 ULID 字符串；展示编号 `number` 是独立字段、**不可当 ID 用** |
| 时间 | ISO8601 UTC 带 `Z`，客户端负责转本地 |
| 分页 | `page`（从 1 起）· `pageSize`（默认 50，上限 200，超出 `422 PAGE_SIZE_EXCEEDED`） |
| 排序 | `sort=createdAt:desc`；白名单仅 6 字段：`number` / `priority` / `status` / `createdAt` / `updatedAt` / `closedAt`，其余 422；默认 `number:desc` |
| 幂等 | 批量写真跑必带 `Idempotency-Key` 头；单条写可选；`dryRun=true` 不耗键（同一 key 可先预览再真跑） |

### 两种凭据

| 凭据 | 传输 | 适用 |
|---|---|---|
| 会话 | `nuxt-session` sealed Cookie（HttpOnly） | 浏览器前端 |
| API Token | `Authorization: Bearer <token>` | 脚本 / AI / MCP 客户端 |

两条铁律：**一人一 token**（身份全局唯一、不携带权限 —— 每次请求按「该用户在该项目内的角色」现查现判）；**凭据只能发给人类账户**（AI 账户不持有可用凭据，`403 AI_SUBJECT_FORBIDDEN`）。

### AI 代理执行（模式 A）

请求头三件套：

```
Authorization: Bearer <发令人的Token>
X-Agent-Mode: on-behalf
X-Agent-Id: <AI账户的ULID>     # 必须是 users.subject_type='ai' 的账户
```

| 规则 | 结果 |
|---|---|
| 权限算法 | **发令人权限 ∩ 项目 AI 允许动作清单**（`projects.settings.ai_actions`），交集不是并集 |
| 默认动作清单 | `issues` create / `issues` update / `replies` create；删除**允许调用但一律不真删**（返回待删清单，由人确认后用人的凭据执行）；改状态等其余动作 ❌ |
| `X-Agent-Mode` 传了但值不是 `on-behalf` | `422`（防止拼错后静默降级为人直连、AI 清单整层失效） |
| Cookie 通道带 `X-Agent-*` 头 | `422`（网页不能自称为 AI 代执行） |
| AI 账户用自己的 Token 直连 | `403 AI_SUBJECT_FORBIDDEN` |

### 权限判定顺序（服务端固定七步）

解析凭据(401) → 项目存在(404 PROJECT_NOT_FOUND)/成员身份(403 NOT_PROJECT_MEMBER) → 权限断言(403 PERM_\*；AI 通道再过滤动作清单 403 AI_ACTION_NOT_ALLOWED) → 业务前置校验(400/404/409) → 事务内落库 → 同事务写留痕 → 返回。

## 端点清单（58 + 1）

### 1 · 会话与身份（5）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 1.1 | POST | `/api/auth/login` | 账号密码登录，下发 sealed Cookie |
| 1.2 | POST | `/api/auth/logout` | 退出 |
| 1.3 | GET | `/api/_auth/session` | 取当前会话（模块自带） |
| 1.4 | GET | `/api/v1/me` | 当前用户资料 + 平台角色 + 当前项目上下文 + 我参与的项目（含各项目角色） |
| 1.5 | PATCH | `/api/v1/me/current-project` | 切换当前项目 |

### 2 · 项目（8）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 2.1 | GET | `/projects` | 任意 | 我参与的项目列表（1.4 已带同形数据，前端默认不打） |
| 2.2 | GET | `/projects/:projectId` | 成员 | 项目详情（含 `myRole`、`issueSeq`、`hasCover`） |
| 2.3 / 2.4 | GET / PATCH | `/projects/:projectId/settings` | 成员读 / 负责人写 | 项目配置（AI 允许动作清单在此维护） |
| 2.5 | PATCH | `/projects/:projectId` | 负责人 / 专业负责人 | 改项目名（**编号不可改**） |
| 2.6 / 2.7 / 2.8 | PUT / GET / DELETE | `/projects/:projectId/cover` | 同上 / 成员 | 封面上传（multipart `file`）/ 读取（无封面 204）/ 移除（幂等） |

### 3 · 分类类目（3，不提供删除）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 3.1 | GET | `/tags` | 成员 | 四维度类目全量（含 `systemItem`「所有问题」） |
| 3.2 | POST | `/tags` | 负责人 / 专业负责人 | 新增类目（缩写维度内唯一，重复 409） |
| 3.3 | PATCH | `/tags/:tagId` | 同上 | 改名称 / 缩写 / 颜色 / 排序（维度不可改） |

### 4 · 问题（7）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 4.1 | GET | `/issues` | 成员 | 列表（分页 / 筛选 / 排序；列表项含 `tags` 按维度分组、`creator`/`executor` 内联人名、派生计数、`shots[]` 截图指针） |
| 4.2 | POST | `/issues` | 负责人 / 专业负责人 / 工程师 | 建问题。无图走 JSON；带图走 multipart（`payload` = JSON 字符串 + `files[]` 问题级附件 + `replyFiles[]` 首条答复附件，合计 ≤6 个） |
| 4.3 | GET | `/issues/:issueId` | 成员 | 详情（完整问题对象 = 列表项全部字段 + `attachments[]` + `replies[]`） |
| 4.4 | PATCH | `/issues/:issueId` | 按判定表 | 局部更新（只改传了的字段）。可写：`description` / `drawingVersion` / `gridLocation` / `priority` / `executorId`（已关闭也放行）/ `tagIds`（全量替换）或 `addTagIds`+`removeTagIds`（增量，与 tagIds 互斥） |
| 4.5 | DELETE | `/issues/:issueId` | 负责人 / 专业负责人 | 软删（连带软删附件；AI 通道降级为待删清单） |
| 4.6 | POST | `/issues/batch` | 逐条判定 | 批量改 / 删 / 状态（`action`: `update` / `delete` / `status`），≤500 条，支持 `dryRun`；**部分成功照常 200**，必须读 `results[]` 与 `summary`（`ok:true` 且 `noop:true` = 本来就是这个值，未产生改动） |
| 4.7 | POST | `/issues/:issueId/status` | **仅执行人** | 关闭 / 重开（甲方 / 协同即便被指为执行人也无权）；目标状态与当前相同 → 幂等返回不重复留痕 |

**4.1 筛选参数**（同参数内多值 = OR，参数之间 = AND）：

`status`（open/closed 多值）· `priority`（1-4 多值）· `typeTagIds` / `majorTagIds` / `specialTagIds` / `subitemTagIds` / `tagIds`（类目，维度内 OR、跨维度 AND；本项目查不到的 ID → 422）· `creatorId` / `executorId`（多值 OR）· `keyword`（描述包含匹配）· `createdFrom`/`createdTo` · `updatedFrom`/`updatedTo` · `missingLocation=true`（缺位置巡检）· `hasReply` · `source`（human/ai/import）。

### 5 · 答复（2，只增不改不删）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 5.1 | GET | `/issues/:issueId/replies` | 成员 | 答复列表（4.3 详情已内联，一般无需单独调） |
| 5.2 | POST | `/issues/:issueId/replies` | **全员（含甲方 / 协同）** | 新增答复（带图 multipart `files[]` ≤6）；甲方 / 协同方唯一写入口 |

### 6 · 文件与附件（5）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 6.1 | POST | `/uploads` | — | **预留恒 501**（原暂存上传方案，已定不做） |
| 6.2 | GET | `/attachments/:attachmentId/raw` | 成员 | 原图 / 原文件。过程附件回原始文件名（RFC 5987）；截图按设计无原名 |
| 6.3 | GET | `/attachments/:attachmentId/thumb` | 成员 | 缩略图（仅截图；服务端按需生成，480px） |
| 6.4 | DELETE | `/attachments/:attachmentId` | 上传人 / 负责人 / 专业负责人 | 软删 |
| 6.5 | POST | `/issues/:issueId/attachments` | 同「编辑字段」 | 追加附件（multipart ≤6；当前界面无独立入口，补图走答复） |

**上传类型白名单**（四道关：体积/数量 → 扩展名 → 内容魔数 → Content-Type）：
图片 `png` / `jpeg` / `webp` / `gif`；文档 `doc` `docx` `pdf` `txt`；表格演示 `xls` `xlsx` `ppt` `pptx`；图纸 `dwg` `dxf`；压缩包 `zip` `rar`。文本须为合法 UTF-8。过程附件 ≤10 MB、只提供下载不做在线预览。

### 7 · 成员（4 + 1）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 7.1 | GET | `/members` | 成员 | 成员列表（含各人平台状态 `status`，用于选执行人时标出停用者） |
| 7.2 | POST | `/members` | 负责人 / 专业负责人 | 加人（移出者复入复用原行） |
| 7.3 | PATCH | `/members/:userId` | 改其他角色：负责人 / 专业负责人；**改专业负责人：仅项目负责人** | `{ "role": "mep_lead" }` |
| 7.4 | DELETE | `/members/:userId` | 负责人 / 专业负责人 | 移出（写 `removed_at`，不删行） |
| 3.1c | GET | `/user-candidates` | 负责人 / 专业负责人 | 按姓名 / 账号检索平台用户（加人选择器用；只回 `id` / `username` / `name` / `status` / `alreadyMember`，`pageSize ≤ 50`） |

### 8 · 项目说明与经济技术指标（6）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 8.1 | GET | `/sections` | 成员 | 概况 + 各专业设计说明 |
| 8.2 | PUT | `/sections/:sectionId` | 负责人 / 专业负责人 | 写正文（Markdown）。**覆盖式 upsert**：按（项目 + 板块类型 + 专业）定位，路径段服务端不读、固定传字面量 `self` —— 新建第一篇不需要另一个端点 |
| 8.3–8.6 | GET / POST / PATCH / DELETE | `/metrics` | 成员读 / 负责人写 | 指标增删改查（一行一指标，按 `groupName` 分组，`level=1` 为「其中：」子项） |

### 9 · 个人中心（8）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 9.1 / 9.2 / 9.3 | GET / POST / DELETE | `/api/v1/me/token` | 查 Token 状态（绝不明文）/ 生成或重置（**明文只返回一次**，重置即吊销）/ 删除 |
| 9.4 | PATCH | `/api/v1/me` | 改姓名 |
| 9.5 | POST | `/api/v1/me/password` | 改密码（旧 + 新；改完当前会话仍有效） |
| 9.6 / 9.8 | PUT / DELETE | `/api/v1/me/avatar` | 上传替换（前端裁 256×256 WebP，原图 ≤5 MB）/ 移除（幂等） |
| 9.7 | GET | `/api/v1/users/:userId/avatar` | 读头像（任意登录用户可读；无 → 204） |

### 10 · 导出（4）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 10.1 | GET | `/export/issues.xlsx` | 第 1 档 Excel，同步流式；吃与 4.1 同一套筛选 query（`page`/`pageSize`/`sort` 除外） |
| 10.2 | POST | `/export/html` | 第 2 档带图 HTML 后台任务，返回 `taskId`；**筛选走 URL query，body 不读** |
| 10.3 | GET | `/export/tasks/:taskId` | 查进度（轮询；任务 ID 进程内，重启即失效 → 404 属正常，提示重发） |
| 10.4 | GET | `/export/tasks/:taskId/files` | 列出 / 下载成品包（大体积自动切多包） |

三档均为：负责人 / 专业负责人 / 工程师可调；甲方 / 协同方 `403 PERM_EXPORT_DENIED`。

### 11 · 审计（1）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 11.1 | GET | `/audit-logs` | 操作记录（当前项目，`createdAt:desc`）。`items[]`：`{ actor, commander, agent, targetType, targetId, targetCode, action, changes, channel, createdAt }`。`channel='ai'` 的行必带发令人 —— 「AI 写入要标注」的落地点 |

### 12 · 平台管理（5，仅平台管理员）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 12.1 | GET | `/api/v1/admin/users` | 用户列表（`keyword` 匹配账号 / 姓名） |
| 12.2 | POST | `/api/v1/admin/users` | 建账号（username 转小写入库；密码 ≥8 位 scrypt 哈希；不回 passwordHash） |
| 12.3 | PATCH | `/api/v1/admin/users/:userId` | 改账号，**只认三个键**：`status` / `platformRole` / `newPassword`。不能改自己的 status / platformRole。停用即刻生效于登录（已下发会话待其自然过期） |
| 12.4 | GET | `/api/v1/admin/projects` | 全平台项目（含 `owner`、`memberCount`、`issueCount`） |
| 12.5 | POST | `/api/v1/admin/projects` | 建项目：系统生成 `YYYY-NNN` 编号 + 必填 `ownerUserId` 指派负责人 + 事务内幂等 seed 41 项分类。⚠️ 建完管理员**进不去该项目**（不是成员），应留在列表页 |

## 错误码（43 个，节选）

| 类 | 码 | HTTP | 含义 |
|---|---|---|---|
| 鉴权 | `AUTH_REQUIRED` / `AUTH_TOKEN_REVOKED` / `AUTH_INVALID_CREDENTIAL` / `AUTH_ACCOUNT_DISABLED` | 401/401/401/403 | 未登录 / Token 吊销 / 账号密码错 / 已停用 |
| 授权 | `NOT_PROJECT_MEMBER` / `PERM_DENIED` / `PERM_ISSUE_CREATE_DENIED` / `PERM_ISSUE_EDIT_DENIED` / `PERM_ISSUE_DELETE_DENIED` / `PERM_EXECUTOR_CHANGE_DENIED` / `PERM_STATUS_CHANGE_DENIED` / `PERM_LEAD_ASSIGN_DENIED` / `PERM_PROJECT_ADMIN_DENIED` / `PERM_EXPORT_DENIED` | 403 | 非成员 / 各动作具体拒绝码（见端点表） |
| AI | `AI_SUBJECT_FORBIDDEN` / `AI_ACTION_NOT_ALLOWED` | 403 | AI 账户持凭据直连 / 动作不在 AI 清单（**提示「请人工操作」，不要换号重试**） |
| 业务 | `ISSUE_CLOSED_LOCKED` | 409 | 已关闭问题锁字段（改执行人 → 重开 → 再改） |
| 业务 | `ISSUE_NUMBER_EXHAUSTED` | 409 | 问题编号超 9999 / 项目编号年内超 999 |
| 业务 | `CROSS_PROJECT_REF` | 400 | 引用了不属于本项目的问题 / 类目 / 附件 / 成员 |
| 业务 | `TAG_ABBR_DUPLICATED` / `TAG_DIMENSION_IMMUTABLE` | 409 | 缩写维度内重复 / 维度不可改 |
| 业务 | `MEMBER_ALREADY_IN_PROJECT` / `MEMBER_ROLE_INVALID` | 409/400 | 重复加入 / 角色非法 |
| 资源 | `VALIDATION_FAILED`（`details.fields` 字段级）/ `PAGE_SIZE_EXCEEDED` / `*_NOT_FOUND` 族 / `USER_NOT_FOUND` / `BATCH_LIMIT_EXCEEDED` / `DRY_RUN_UNSUPPORTED` | 422/422/404/404/400/400 | 参数 / 分页 / 资源（PROJECT · ISSUE · TAG · METRIC · REPLY · ATTACHMENT） |
| 文件 | `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_TYPE_DENIED` / `ATTACHMENT_MIME_MISMATCH` | 413/415/400 | 超限 / 扩展名不在白名单 / 内容与扩展名不符 |
| 幂等 | `IDEMPOTENCY_KEY_REUSED` / `IDEMPOTENCY_KEY_REQUIRED` | 409/400 | 同键不同请求体 / 批量写缺键 |
| 其他 | `RATE_LIMITED`（预留） / `NOT_IMPLEMENTED` / `INTERNAL_ERROR` | 429/501/500 | 限流未启用 / 端点未实现（6.1）/ 服务端异常 |

## 事务与一致性

- 一个业务动作 = 一个事务；写库与写 `audit_log` 必须同事务；
- 事务内严禁真实异步 I/O；文件一律**先落盘、再写库**，写库失败删掉刚落的文件（「建问题带图」整体一个 multipart 请求内完成：分配 ULID → 落盘 → 事务内写 issues + attachments → 任一步失败回滚并清理）；
- 批量接口**逐条独立事务**（一条问题一个事务，不整批塞进一个大事务），部分成功是既定语义。

## MCP

规划为 REST 之上的**薄壳**：只做 MCP 协议 ↔ HTTP 的翻译与转发（`Authorization` 头原样透传），不重复实现权限 / 业务规则 / 数据库访问。REST 侧改字段或规则时，MCP 侧只需改工具描述。本契约即 MCP 的唯一事实来源。
