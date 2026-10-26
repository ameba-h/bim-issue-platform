# API 参考

> 本页是站点侧的接口总览与口径说明；逐端点的请求 / 响应字段表以代码仓的契约文档为准。项目级接口统一前缀 `/api/v1/projects/:projectId`，下表省略该前缀。

## 📋 通用约定

| 项 | 约定 |
|---|---|
| 前缀 | 业务接口 `/api/v1`；登录 / 登出 `/api/auth/*`、会话 `/api/_auth/session` 不加前缀 |
| **projectId 强制进路径** | 所有业务接口路径必须含 `projectId`，**不存在「只按 issueId 操作」的端点**（`issueId` 本身不含项目信息，这样的口子是跨项目越权的入口） |
| 资源命名 | 复数名词：`projects` / `issues` / `replies` / `attachments` / `tags` / `members` |
| 成功响应 | 单资源 → 对象本身；列表 → `{ "items": [...], "page": { total, page, pageSize, totalPages } }`；状态码 200 / 201 / 204 |
| 失败响应 | `{ "error": { "code": "PERM_DENIED", "message": "中文文案", "details": {...} } }` —— **按 `code`（字符串常量）判分支**，不要解析 `message` 文字。⚠️ HTTP 404 也可能来自「路径写错」（无 `error.code`），判别先看响应体形状 |
| ID | 26 位 ULID 字符串；展示编号 `number` 项目内递增、**不可当 ID 传**（跨项目同号是两条不同问题） |
| 时间 | ISO8601 UTC 带 `Z`，客户端负责转本地 |
| 分页 | `page`（从 1 起）· `pageSize`（默认 50，上限 200，超出 `422 PAGE_SIZE_EXCEEDED`） |
| 排序 | 写法 `sort=priority:asc,createdAt:desc`；白名单仅 6 字段：`number` / `priority` / `status` / `createdAt` / `updatedAt` / `closedAt`，其余 422；默认 `number:desc` |
| 枚举 | `priority` 是**整数 1–4**（1 紧急 / 2 普通 / 3 轻微 / 4 建议，中文名由前端映射，接口不传中文）；`status` 是 `open` / `closed`；平台角色字段叫 `platformRole`（与项目内角色是两回事，别混用） |
| 排序 vs 筛选 | 排序重排队、条数不变；筛选挑子集、结果变少，两者可叠加。「只看紧急的」用 `?priority=1`，**不是** `?sort=priority:asc` |
| 幂等 | 批量写真跑必带 `Idempotency-Key` 头；单条写可选；`dryRun=true` 时键可带可不带、**也不消耗**（同一 key 可先预览再真跑） |
| 批量写 | 单次**最多 500 条**；**部分成功照样返回 `200`** —— 调用方必须读 `failed` 与 `results[]`（`ok:true` 且 `noop:true` = 本来就是这个值），只判 200 会漏掉失败项 |
| PATCH 一族 | 认不出的键**直接拒**；传了但真无变化的回同层 `noop: true`（该键只在为真时出现），**不写库、不写留痕、不推 `updatedAt`** |

### 两种凭据

| 凭据 | 传输 | 适用 |
|---|---|---|
| 会话 | `nuxt-session` sealed Cookie（HttpOnly） | 浏览器前端，**前端 JS 读不到凭据** |
| API Token | `Authorization: Bearer <token>` | **MCP 通道专用** —— 只给 AI 客户端经 `/mcp` 那层薄壳用；库里只存哈希，命中后校验未吊销 |

四条铁律：**一人一 token**（身份全局唯一、不携带权限 —— 每次请求按「该用户在该项目内的角色」现查现判，同一人 A 项目当负责人、B 项目按工程师算）；**禁止 AI 通用令牌**（不存在能横跨所有项目的 AI 身份）；**凭据只能发给人类账户**（AI 账户不持有可用凭据，`403 AI_SUBJECT_FORBIDDEN`）；**令牌是 MCP 专属凭据** —— 拿它直连本文任一 REST 端点（**GET 也算，自己写脚本也算**）一律 `403 TOKEN_AI_CHANNEL_ONLY`，**人查数据用网页**。

### AI 代理执行

AI 只有一条路：经 `/mcp` 薄壳、**借发令人的令牌**转发。请求头三件套**由薄壳注入，客户端不需要、也没法自己声明**（自带的声明头一律无效 —— 声明可伪造，而 AI 账户编号从操作记录里就能读到）：

```
Authorization: Bearer <发令人的Token>
X-Agent-Mode: on-behalf
X-Agent-Id: <AI账户的ULID>     # 必须是 users.subject_type='ai' 的账户
```

四种进法，各落到哪一格：

| 场景 | 通道 | 权限算法 | 三个身份怎么落 |
|---|---|---|---|
| 人在网页操作 | `web` | 主体自身角色 | 操作者 = 人；发令人与代理两格空着 |
| 人拿令牌直连 REST（脚本也算） | —— | ⛔ `403 TOKEN_AI_CHANNEL_ONLY`（读写皆然） | — |
| **AI 客户端经 MCP 薄壳** | **`ai`** | **发令人权限 ∩ 项目 AI 允许动作清单** | 操作者 = AI 账户（每次转发前从库现解析在用的那个，多个取最早建的）· 发令人 = 令牌主人 · 代理 = AI 账户；写进问题 / 板块 / 指标的出身标 `ai` |
| AI 拿自己的令牌直连 | —— | ⛔ `403 AI_SUBJECT_FORBIDDEN` | — |

细则：

| 规则 | 结果 |
|---|---|
| AI 允许动作清单（交集右项，**只管写**） | **五项**：`issue_create` 创建问题 · `issue_update` 编辑问题 · `reply_create` 追加答复 · `section_write` 撰写说明板块（**一个动作罩概况与设计说明两类**，闸按方法 + 路径判）· `metric_write` 撰写经济技术指标。**读不受清单约束** |
| 删除类（不占清单） | **允许调用、一律不真删** → 降级为「待删清单」，由人确认后用人自己的凭据再执行。指标表没有软删列，这一道降级不是装饰 |
| 关闭 / 重开（4.7 与批量的 status） | **永久不在名单，不是漏了、也别顺手补上**：算进「编辑问题」会让关闭重开冒充编辑过关 —— 实测过同一枚令牌十分钟内把一条已关闭的问题开了又关。**要不要关由人来决定** |
| 其余一切（改类目 / 改项目设置 / 管成员 / 建项目等） | ❌ 不放开，用到再逐项加；白名单从窄往宽放 |
| 清单的默认值 | 新建项目与从未保存过设置的项目 = 全集默认给；⚠️ 负责人**保存过一次**，库里存的就是当时勾的显式清单 —— **后加的动作对既存项目默认是关的**，AI 打某些项目吃 `403 AI_ACTION_NOT_ALLOWED` 是预期不是缺陷（拒绝话术说中文称谓、引导联系负责人去项目设置勾选） |
| `X-Agent-Mode` 传了但值不是 `on-behalf` | `422`（防止拼错后静默降级成人直连、AI 清单整层失效） |
| Cookie 通道（网页）带 `X-Agent-*` 头 | **忽略、不报错** —— 网页请求不可能带对内部通道凭据，天然不会被误判成代理执行；浏览器不需要发任何 AI 相关的头 |
| 代理执行不要求该 AI 已加入本项目 | 权限 = 发令人 ∩ 清单，不含 AI 自身角色，成员校验没有防护作用；AI 是「执行器」不是「项目成员」，`project_members.role` 没有 `'ai'` 取值 |
| 库里没有在用的 AI 账户 | **写一律拒（fail-closed），读照常放行** —— 宁可拒也不把 AI 的操作记到令牌主人名下；管理员建好或恢复后**下一发即恢复、无需重启**，「停用 AI 账户」就是 AI 写侧的总开关 |
| 待删清单没有服务端队列 | 服务端不记账，是人拿自己的会话再发一次才真删；要不要建队列属待拍板 |

### 权限判定顺序（服务端固定，不要自己发明）

```
（0）三道集中闸，顺序固定，与具体端点无关：
      通道闸 —— 仅带令牌或代理头才进；令牌不是来自薄壳 → 403 TOKEN_AI_CHANNEL_ONLY
                （代理执行时 AI 清单过滤也压在这最前面）
      空字符闸 —— JSON 体含 NUL → 422，details.fields 点名是哪几个字段
                （非 UTF-8 字节不拦，落库成替换符是定案放行，不是漏）
      冻结写闸 —— 写方法 + 项目路径 + 项目非活动 → 403 PROJECT_FROZEN
                （导出与移交负责人两条口在白名单里）
（1） 解析凭据（会话 / Bearer，两条凭据解析成同一个主体）        → 401
（2） 项目存在                                                  → 404 PROJECT_NOT_FOUND
      主体是在册成员，取出项目内角色                              → 403 NOT_PROJECT_MEMBER
（3） 逐动作权限断言                                            → 403 PERM_*
（4） 业务前置校验（项目归属、类目归属、状态机、编号余量）        → 400 / 404 / 409
（5） 事务内落库                                                → 500
（6） 写 audit_log（与第（5）步同一事务）                        → 500
（7） 返回
```

三个容易读错的点：第（2）步给两个码是故意的 ——「项目不存在」该引导换项目、「不是成员」该找负责人加人，前端交互完全不同（一条 LEFT JOIN 就能分开，不是被禁的两步式）；第（3）步之前**没有**「AI 清单」那一步 —— AI 过滤在第（0）步最前面，不该先跑一遍端点里的查询才撞 403；权限判定主体（`subjectId`）与留痕实际操作者（`actorId`）是两个东西 —— **代理执行下前者是发令人、后者是 AI**，「仅自己创建」「仅执行人」一律按主体判，拿 actorId 去比会把工程师的 AI 连自己提的问题都改不了。

## 🗂️ 端点清单（67 行登记 / 65 个真实实现）

> 67 行里含 1 个恒回 501 的预留口（6.1）与 1 个模块自带的会话端点（1.3，无路由文件）；对外口径统一说 **65 个**。另外签名下载口 `/d/export/*`（10.5 的取件通道）**刻意不在 `/api/**` 下、不判任何凭据**，不属于这一族。

### 1 · 会话与身份（5）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 1.1 | POST | `/api/auth/login` | 账号密码登录，下发 sealed Cookie |
| 1.2 | POST | `/api/auth/logout` | 退出 |
| 1.3 | GET | `/api/_auth/session` | 取当前会话（模块自带） |
| 1.4 | GET | `/api/v1/me` | 当前用户资料 + 平台角色 + 当前项目上下文 + 我参与的项目（含各项目角色） |
| 1.5 | PATCH | `/api/v1/me/current-project` | 切换当前项目（只解决「默认看哪个」，不替代逐请求鉴权） |

### 2 · 项目（8）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 2.1 | GET | `/projects` | 任意 | 我参与的项目列表（统一列表壳；1.4 已带同形数据，前端默认不打） |
| 2.2 | GET | `/projects/:projectId` | 成员 | 项目详情（含 `myRole`、`issueSeq`、`hasCover`） |
| 2.3 / 2.4 | GET / PATCH | `/projects/:projectId/settings` | 成员读 / 负责人写 | 项目配置（**AI 允许动作清单在此维护，PATCH 是整份覆盖写**） |
| 2.5 | PATCH | `/projects/:projectId` | 负责人 / 专业负责人 | 改项目名（**编号不可改**） |
| 2.6 / 2.7 / 2.8 | PUT / GET / DELETE | `/projects/:projectId/cover` | 同上 / 成员 | 封面上传（multipart `file`）/ 读取（无封面 204）/ 移除（幂等）。封面文件名是项目 ID、单张替换即覆盖 |

### 3 · 分类类目（3，不提供删除）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 3.1 | GET | `/tags` | 成员 | 四维度类目全量（含 `systemItem`「所有问题」—— 它不入表，展示口径共 42 项） |
| 3.2 | POST | `/tags` | 负责人 / 专业负责人 | 新增类目（缩写维度内唯一，重复 409） |
| 3.3 | PATCH | `/tags/:tagId` | 同上 | 改名称 / 缩写 / 颜色 / 排序（**维度不可改**） |

### 4 · 问题（8）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 4.1 | GET | `/issues` | 成员 | 列表（分页 / 筛选 / 排序；列表项含按维度分组的 `tags`、`creator`/`executor` 内联人名、派生计数、`shots[]` 截图指针） |
| 4.2 | POST | `/issues` | 负责人 / 专业负责人 / 工程师 | 建问题。无图走 JSON；带图走 multipart（`payload` = 同一份 JSON 的字符串 + `files[]` 问题级附件 + `replyFiles[]` 首条答复附件，**合计 ≤6 个**，两族字段名不可合并 —— 文件本体不带归属信息，只靠字段名区分）。`executorId` 四条校验：查无此人 404 / 不在本项目 400 `CROSS_PROJECT_REF` / 已停用 422 / **甲方与协同方不能被指派** 422（后两条都点名 `details.fields.executorId`） |
| 4.3 | GET | `/issues/:issueId` | 成员 | 详情（列表项全部字段 + `attachments[]` + `replies[]`） |
| 4.4 | PATCH | `/issues/:issueId` | 按判定表 | 局部更新（只改传了的字段）。可写：`description` / `drawingVersion` / `gridLocation` / `priority` / `executorId`（已关闭也放行，校验同 4.2，且排在锁判之前）/ `tagIds`（全量替换）或 `addTagIds`+`removeTagIds`（增量，与 tagIds 互斥） |
| 4.5 | DELETE | `/issues/:issueId` | 负责人 / 专业负责人 | 软删（连带软删附件；**AI 通道降级为待删清单**） |
| 4.6 | POST | `/issues/batch` | 逐条判定 | 批量改 / 删 / 状态（`action`: `update` / `delete` / `status`），≤500 条，支持 `dryRun`；**每一条自己判角色**（前面没有整批角色闸）；`status` 那族先角色再执行人；`patch.executorId` 是请求级校验，不在册整批 400、停用或甲方协同 422 |
| 4.7 | POST | `/issues/:issueId/status` | **仅执行人** | 关闭 / 重开（甲方 / 协同即便被指为执行人也无权）；目标状态与当前相同 → 幂等返回不重复留痕 |
| 4.8 | GET | `/issues/stats` | 成员 | **首页汇总报表数据源**。吃与 4.1 完全同一套筛选参数。响应 `{ total, byStatus: {open, closed}, byPriority: {'1'…}, byType / byMajor / bySpecial / bySubitem: [{ id, code, name, abbr, color, count }] }`。⚠️ 分组计数是「标签计数」：多挂同类目各计一次，**之和可大于 total，属设计**；零条数类目也回 `count: 0`（类目从列表消失 = 漏事实，不是没数据）；每维度按条数降序、同条数按类目定义序 |

**4.1 筛选参数**（同参数内多值 = OR，参数之间 = AND）：

`status` · `priority` · `typeTagIds` / `majorTagIds` / `specialTagIds` / `subitemTagIds` / `tagIds`（维度内 OR、跨维度 AND；本项目查不到的 ID → 422）· `creatorId` / `executorId` · `keyword`（描述包含）· `createdFrom`/`createdTo` · `updatedFrom`/`updatedTo` · `missingLocation=true`（缺位置巡检）· `hasReply` · `source`（human/ai/import）。

### 5 · 答复（2，只增不改不删）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 5.1 | GET | `/issues/:issueId/replies` | 成员 | 答复列表（`createdAt:asc`；4.3 已内联，一般无需单独调） |
| 5.2 | POST | `/issues/:issueId/replies` | **全员（含甲方 / 协同）** | 新增答复（带图 multipart `files[]` ≤6，同一套尺寸闸）；甲方 / 协同方唯一写入口 |

### 6 · 文件与附件（5）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 6.1 | POST | `/uploads` | — | **预留恒 501**（原暂存上传方案，已定不做；算登记数不算实现数） |
| 6.2 | GET | `/attachments/:attachmentId/raw` | 成员 | 原图 / 原文件。下载名 = 库里 `original_name`（ASCII 兜底名在前、原始名走 RFC 5987）；⚠️ **扩展名不信用户给的名字、以库里魔数结论为准**（否则 `.pdf` 改名 `.html` 就能让同源内容被当 HTML 执行）；原始名里的控制字符 / 引号 / 路径分隔符一律剔除；**截图按设计没有原名**，那不是漏；图片类响应 `inline` |
| 6.3 | GET | `/attachments/:attachmentId/thumb` | 成员 | 缩略图（仅截图）。服务端按需生成：纯 JS 等比缩到**最长边 480px**、离线编码 WebP（wasm 随包走、不联网）、落 `thumbs/<ID>.webp` 扩展名恒定；小图不放大；**生成失败回退原图、不报错**；不入库、按路径推导 |
| 6.4 | DELETE | `/attachments/:attachmentId` | 上传人 / 负责人 / 专业负责人 | 软删（端点不分问题级与答复级，按附件 ID 删） |
| 6.5 | POST | `/issues/:issueId/attachments` | 同「编辑字段」 | 追加附件（multipart ≤6，与建问题同一套文件链路） |

**上传类型白名单**（四道关：体积/数量 → 扩展名 → 内容魔数 → Content-Type）：图片 `png` / `jpeg` / `webp` / `gif`；文档 `doc` `docx` `pdf` `txt`；表格演示 `xls` `xlsx` `ppt` `pptx`；图纸 `dwg` `dxf`；压缩包 `zip` `rar`。文本须为合法 UTF-8。过程附件 ≤10 MB、单次 ≤6 个，只提供下载不做在线预览。

### 7 · 成员（6）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 7.1 | GET | `/members` | 成员；**平台管理员可只读**（移交选人用） | 成员列表，每人带**平台**状态 `status`（选执行人 / 加人时标出停用者；前端不去调只对管理员开的 12.1）。元素冻结：`{ userId, name, role, status, joinedAt, hasAvatar }` |
| 7.2 | POST | `/members` | 负责人 / 专业负责人 | 加人。移出者**复入复用原行**：`joinedAt` = 首次加入时间、复入不刷新；响应多第六键 `rejoined`（恒在：首加 `false`、复入 `true`，7.1 列表里没有这颗键）；留痕 `changes[]` 首位带 `rejoined`（语义在键上）。重复加入 = `409 MEMBER_ALREADY_IN_PROJECT`（不是 422） |
| 7.2b | GET | `/user-candidates` | 负责人 / 专业负责人 | 加人用的平台用户检索（`keyword` / `page` / `pageSize ≤ 50`，元素 `{ id, username, name, status, alreadyMember }`）；未加入在前、再按账号升序；**候选池只含人类账户** |
| 7.3 | PATCH | `/members/:userId` | 负责人 / 专业负责人**都可**（含任命、降级专业负责人） | `{ "role": "mep_lead" }`。目标或现任是 `project_owner` → `400 MEMBER_ROLE_INVALID`（**移交负责人走 7.5，不经这里**）。响应元素无 `status`；未变时同层 `noop: true` |
| 7.4 | DELETE | `/members/:userId` | 负责人 / 专业负责人 | 移出（写 `removed_at`，**不删行**） |
| 7.5 | POST | `/owner` | **仅平台管理员** | 移交项目负责人（体 `{ "userId" }`）；在冻结写闸白名单里 |

### 8 · 项目说明与经济技术指标（6）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 8.1 | GET | `/sections` | 成员 | 概况 + 各专业设计说明。元素：`{ id, sectionType: overview/design, discipline, title, content, sort, source, updatedBy, updatedAt }`（无 `createdAt`） |
| 8.2 | PUT | `/sections/:sectionId` | 负责人 / 专业负责人 | 写正文（Markdown）。**覆盖式 upsert**：按（项目 + `sectionType` + `discipline`）定位，**路径段服务端不读、全站固定传字面量 `self`**（留痕取库里真实行 ID，占位串不污染）⇒ 新建第一篇不需要另一个端点。概况只有一篇、再写即整篇覆盖；首篇概况由前端首次进入时写占位正文（建项目端点**不** seed 空白篇）。`source` 按通道记 `human` / `ai` |
| 8.3 | GET | `/metrics` | 成员 | 按 `groupName` 分组回读（元素含 `level`、`sort`、`note`、`source`、`updatedBy`；无 `createdAt`） |
| 8.4 | POST | `/metrics` | 负责人 / 专业负责人 | 新增指标（`level=1` 是「其中：」子项；不写排序追加到组尾） |
| 8.5 | PATCH | `/metrics/:metricId` | 同上 | 修改指标（只传要改的；同值回 `noop: true`；**出身不翻**） |
| 8.6 | DELETE | `/metrics/:metricId` | 同上 | 删除指标。**指标表没有软删列** —— 人删是物理删，AI 通道只回待删清单 |

### 9 · 个人中心（8）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 9.1 | GET | `/api/v1/me/token` | 查 Token 状态：`{ exists: false }` 或 `{ exists: true, name, createdAt, lastUsedAt }` —— **绝不明文回显** |
| 9.2 | POST | `/api/v1/me/token` | 生成或**重置**（重置即吊销：删旧插新）；**明文只在本次响应返回一次** |
| 9.3 | DELETE | `/api/v1/me/token` | 删除 |
| 9.4 | PATCH | `/api/v1/me` | 改姓名（仅姓名；头像在 9.6–9.8）。未变回 `noop: true`、变更带 `previousName` |
| 9.5 | POST | `/api/v1/me/password` | 改密码（旧 + 新；改完当前会话仍有效） |
| 9.6 | PUT | `/api/v1/me/avatar` | 上传 / 替换头像（multipart `file`；原图 ≤5 MB，前端自动裁方）。回 `{ hasAvatar: true, updatedAt }` |
| 9.7 | GET | `/api/v1/users/:userId/avatar` | 读头像（任意登录用户可读；无 → 204） |
| 9.8 | DELETE | `/api/v1/me/avatar` | 移除头像（回「无头像」态，**幂等**） |

### 10 · 导出（5 + 1 条匿名取件通道）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 10.1 | GET | `/export/issues.xlsx` | 第 1 档 Excel，**同步流式**（边生成边吐）；吃 4.1 同一套筛选 query。勾选 `ids` 也只能走 query（GET 没有体），条数一多逼近请求头上限 —— 改走 10.2 |
| 10.2 | POST | `/export/html` | 第 2 档带图 HTML **后台任务** → 201 + `{ taskId, status: 'running' }`。**筛选走 URL query**（塞 body = 静默导全量）；`ids` 可走 JSON 体、与 query 二选一同时给 422 —— 体里**只认 `ids` 这一项**。`taskId` 是进程内 ID 重启即失效；同一秒第 21 发 → `429 RATE_LIMITED`（不是 500，那一发一个目录都不建） |
| 10.3 | GET | `/export/tasks/:taskId` | 查进度（轮询）：`{ taskId, status: running/done/failed, via: 'web'/'ai', error, startedAt, finishedAt, packages? }`。**`via` 记发起通道**（网页点击 / MCP 薄壳代跑），只活在进程内注册表、不建表不进留痕。任务失效 → 404 `UPLOAD_NOT_FOUND`（复用预留码，语义 = 进程内资源不存在或已过期），提示重发属正常 |
| 10.4 | GET | `/export/tasks/:taskId/files` | 列出 / 下载成品包：不带 `file` 回 `{ taskId, status, items: [{ file, name, bytes }] }`（`file` 是磁盘名 `volume-N.zip`、`name` 是给人看的下载名）；带 `?file=` 回 ZIP 二进制，`Content-Disposition` 挂下载名。磁盘名与下载名**都认**，且只认任务登记过的包（防目录穿越） |
| 10.5 | POST | `/export/issues` | **AI 通道一键导出**：体 `{ format: 'html'/'xlsx' }`（默认 html）+ 同一套筛选 query + 体里 `ids` → **同步等打包完成**，回 `{ taskId, status, format, expiresInMs, links: [{ file, name, bytes, url, expiresAt }], note }`。`url` 是 **10 分钟内有效的 HMAC 签名链接**（罩住项目 + 任务 + 包名 + 过期时刻；密钥只活进程内存，**重启换钥 = 旧链接全体作废**）。智能体对 `GET /d/export/:projectId/:taskId?f=&e=&s=` **匿名下载** —— 那条口不在 `/api/**` 下、不判任何凭据（凭据就是链接本身），篡改 / 过期 / 任务失效一律同一句 403 不区分原因。打包超十分钟没封口 → 429「稍后再发」（任务没丢）。错误码零新增；薄壳工具 `export_issues` 一对一映射这一发 |

网页三档 + AI 导出均为：负责人 / 专业负责人 / 工程师可调；甲方 / 协同方 `403 PERM_EXPORT_DENIED`。导出与移交负责人**在冻结写闸的白名单里** —— 项目冻结不影响导清单。

### 11 · 审计（1）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 11.1 | GET | `/audit-logs` | 操作记录（当前项目，`createdAt:desc`）。筛选：`targetType` / `action` / `actorId` 三个多值参数（逗号分隔 = OR，可组合；`actorId` 按操作者筛、不校验存在性 —— 查无此人的 ID 就是空结果）。`items[]`：`{ actor, commander, agent, targetType, targetId, targetCode, action, changes, channel, createdAt }`。`channel='ai'` 的行必带发令人 —— 「AI 写入要标注」的落地点 |

### 12 · 平台管理（6，仅平台管理员）

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 12.1 | GET | `/api/v1/admin/users` | 用户列表（`keyword` 匹配账号 / 姓名） |
| 12.2 | POST | `/api/v1/admin/users` | 建账号（username 转小写入库；密码 ≥8 位、内置 scrypt 哈希；不回 `passwordHash`） |
| 12.3 | PATCH | `/api/v1/admin/users/:userId` | 改账号，**只认三个键**：`status` / `platformRole` / `newPassword`。不能改自己的 status / platformRole。停用即刻生效于登录（已下发会话待其自然过期） |
| 12.4 | GET | `/api/v1/admin/projects` | 全平台项目（含 `owner`、`memberCount`、`issueCount`、活动状态） |
| 12.5 | POST | `/api/v1/admin/projects` | 建项目：编号**系统生成**（`YYYY` + 3 位年内序号，如 `2026-001`，不接受客户端传入）+ 必填 `ownerUserId` 指派负责人 + 事务内幂等初始化 41 项分类。⚠️ 建完管理员**进不去该项目**（不是成员），前端应留在列表页 |
| 12.6 | POST | `/api/v1/admin/projects/:projectId/status` | **冻结 / 恢复项目**：体 `{ "status": "archived" / "active" }`。冻结 = 成员侧写操作全关（第（0）步冻结写闸统一拦，`403 PROJECT_FROZEN`），读不受影响；闸门集中一处、不散在各端点各判一遍 |

### 13 · IFC 模型（4）

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 13.1 | GET | `/models` | **项目全员**（含甲方 / 协同 —— 看清单不需要写权限） | 整套模型清单。**无分页**（一个项目同时只有一套）。`{ items: [{ id, originalName, version, fileSize, uploader, createdAt }], count, parse }`：`items` 按登记时间正序（同一次上传内不保证等于上传顺序，界面要排就按 `originalName` 自己排）；`count` 冗余给标题；`uploader` 是对象不是 id，用户被删时名字降级空串、不整行丢；`parse` 是解析状态四态 |
| 13.2 | POST | `/models` | 负责人 / 专业负责人 / 工程师；甲方 / 协同 `403` | **上传整套，覆盖式** —— 旧的一套连文件带解析产物当场删掉，**没有历史版本可回退**，一次要把一套传齐。multipart 文件字段名 `files`，前端走目录上传。响应 201 + 与 13.1 同形，`parse.state` 恒为 `parsing`；**没装 Python 的话这一轮很快变 `failed` + 原因，上传本身不受影响** |
| 13.3 | DELETE | `/models` | 同 13.2 | 删整套。**响应恒 204、幂等**。这是全平台**唯一硬删**的业务对象 —— 问题 / 附件 / 头像永远软删，别把这条例外推广过去 |
| 13.4 | GET | `/models/parse-env` | 项目全员（与 13.1 同一集合，不开新权限面） | 上传前探测「这台部署机现在能不能解析」。**只回 200 + 四态**（或 404/403 两个既有码），零新增错误码。三条口径：答案**与项目无关**、说的是这台机器，界面别写成「本项目的解析环境」；**零副作用**（不写状态、不触发解析）；`message` 恒非空可直接展示，不含绝对路径与解释器版本 |

## 🔢 错误码（45 枚，节选）

| 类 | 码 | HTTP | 含义 |
|---|---|---|---|
| 鉴权 | `AUTH_REQUIRED` / `AUTH_INVALID_CREDENTIAL` / `AUTH_TOKEN_REVOKED` / `AUTH_ACCOUNT_DISABLED` | 401/401/401/403 | 没带凭据 / 带了认不出 / Token 已吊销 / 已停用 |
| 通道 | **`TOKEN_AI_CHANNEL_ONLY`** | 403 | 令牌直连 REST（读写皆然）。人话：让 AI 客户端配 `/mcp`，人查数据用网页 |
| 通道 | `AI_SUBJECT_FORBIDDEN` / `AI_ACTION_NOT_ALLOWED` | 403 | AI 账户持凭据直连 / 动作不在 AI 清单（**提示「请人工操作」，不要换号重试**） |
| 项目 | `PROJECT_FROZEN` / `PROJECT_NOT_FOUND` | 403/404 | 项目冻结中（成员侧写全关）/ 项目不存在 |
| 授权 | `NOT_PROJECT_MEMBER` / `PERM_DENIED` / `PERM_ISSUE_CREATE_DENIED` / `PERM_ISSUE_EDIT_DENIED` / `PERM_ISSUE_DELETE_DENIED` / `PERM_EXECUTOR_CHANGE_DENIED` / `PERM_STATUS_CHANGE_DENIED` / `PERM_LEAD_ASSIGN_DENIED` / `PERM_PROJECT_ADMIN_DENIED` / `PERM_EXPORT_DENIED` | 403 | 非成员 / 各动作具体拒绝码（见端点表） |
| 业务 | `ISSUE_CLOSED_LOCKED` | 409 | 已关闭问题锁字段（路径固定三步：改执行人 → 重开 → 再改） |
| 业务 | `ISSUE_NUMBER_EXHAUSTED` | 409 | 问题编号超 9999 / 项目编号年内超 999 |
| 业务 | `CROSS_PROJECT_REF` | 400 | 引用了不属于本项目的问题 / 类目 / 附件 / 成员 |
| 业务 | `TAG_ABBR_DUPLICATED` / `TAG_DIMENSION_IMMUTABLE` | 409 | 缩写维度内重复 / 维度不可改 |
| 业务 | `MEMBER_ALREADY_IN_PROJECT` / `MEMBER_ROLE_INVALID` | 409/400 | 重复加入 / 角色非法（含动负责人那一行） |
| 参数 | `VALIDATION_FAILED`（`details.fields` 字段级）/ `PAGE_SIZE_EXCEEDED` / `BATCH_LIMIT_EXCEEDED` / `DRY_RUN_UNSUPPORTED` | 422/422/400/400 | 参数 / 分页 / 批量超 500 / 该动作不支持预演 |
| 资源 | `*_NOT_FOUND`（PROJECT · ISSUE · TAG · METRIC · REPLY · ATTACHMENT · USER） | 404 | 见端点表 |
| 文件 | `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_TYPE_DENIED` / `ATTACHMENT_MIME_MISMATCH` / `UPLOAD_NOT_FOUND` | 413/415/400/404 | 超限 / 扩展名不在白名单 / 内容与扩展名不符 / 进程内任务已失效 |
| 幂等 | `IDEMPOTENCY_KEY_REUSED` / `IDEMPOTENCY_KEY_REQUIRED` | 409/400 | 同键不同请求体 / 批量写缺键 |
| 其他 | `RATE_LIMITED` / `NOT_IMPLEMENTED` / `INTERNAL_ERROR` | 429/501/500 | 同秒导出挤兑、AI 打包超时（真会回，不是预留摆设）/ 端点未实现（6.1）/ 服务端异常 |

## 🔄 事务与一致性

- 一个业务动作 = 一个事务；**写库与写 `audit_log` 必须同一事务** —— 否则会出现「数据改了、留痕没写」；
- **事务内严禁真实异步 I/O**（读写文件、发网络请求）；文件一律**先落盘、再写库**，写库失败删掉刚落的文件（反过来会留下「库里有记录、磁盘没文件」的坏数据）。「建问题带图」在同一个 multipart 请求内完成：分配 ULID → 按 ID 落盘全部文件 → 事务内写 issues + attachments → 任一步失败回滚并清理本次已落文件；配合 `Idempotency-Key`，网络中断后重发不重复建问题；
- 批量接口**逐条独立事务**（一条问题一个事务，不整批塞一个大事务），部分成功是既定语义；
- 存储路径（**文件名 = 记录 ID，不是哈希**）：截图 `data/uploads/<项目ID>/issues/年/月/ID.ext` · 缩略图 `thumbs/ID.webp`（不入库，按路径推导、扩展名恒 `.webp`）· 过程附件 `attach/年/月/ID.ext` · 模型 `models/ID.ifc` · 封面 `cover/项目ID.ext`（单张替换即覆盖）· 头像 `data/uploads/avatars/用户ID.ext`（用户级，不在项目目录内）· 导出产物 `data/exports/`（不入库、不混 uploads）；
- `attachments.file_hash`（SHA256）只作完整性校验与孤儿比对，**不承担去重** —— 同一张图重复上传得到两条记录；
- 访问文件**一律过鉴权**，不得静态暴露目录。

## 🤖 MCP

REST 之上还有一层 MCP 薄壳（17 个工具，随平台进程启动，接入只需一个 URL + 一枚令牌）。它只做翻译 + 转发，**本文这些端点就是它的唯一事实来源**；工具清单、通道口径与已知边界在 MCP 那两页：

- [接入与通道口径](/mcp/access) —— 怎么配、令牌为什么只能走这一条路、三个身份怎么落；
- [工具清单（17 个）](/mcp/tools) —— 逐个工具的行为差异与要点。
