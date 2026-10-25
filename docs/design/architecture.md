# 架构与技术选型

## 总体形态

**Nuxt 4 全栈单仓**：`app/` 是前端（SPA，`ssr: false`），`server/` 是 Nitro 后端（全部业务 API），`shared/` 是前后端共用的类型定义。一个进程同时服务页面与接口，部署单元只有一个。

```
浏览器（SPA）
   │  会话 Cookie（HttpOnly，前端 JS 读不到）
   ▼
Nitro server（server/api/v1/**）
   │  鉴权 → 项目上下文校验 → 权限断言（AI 通道再过一层动作清单）
   │  → 业务校验 → 事务内落库 + 留痕
   ▼
Drizzle ORM ──► SQLite（node:sqlite）/ MySQL（mysql2）
   │
   └──► 文件系统 data/（StorageProvider 抽象，当前实现为本地磁盘）
```

## 关键选型及理由

### 为什么 SPA（`ssr: false`）

后台系统无 SEO 需求，SSR 的两大收益（首屏 HTML、爬虫索引）都用不上；SPA 单执行路径、无登录态闪烁、无 hydration 排错负担。代价仅是首屏由 JS 渲染，内网场景可忽略。

### 为什么默认 SQLite + Node 内置驱动

- **零原生编译**：使用与部署平台的人是 BIM 工程师而非运维，装不上 = 平台不存在。`better-sqlite3` 需要 prebuild 覆盖（内网拿不到 GitHub 时静默退化为本地编译，需要 C++ 工具链），因此选 Node 22 内置的 `node:sqlite`（同步驱动，零网络依赖、免编译）；
- **零配置**：一个文件一个库，备份即拷贝，支撑「下载 → 建库 → 启动」的开箱体验；
- MySQL 作为一等公民并存（多人共享开发库 / 接入既有基础设施），ORM 层约束为跨方言，业务代码不写死任何一方言语法。

### 为什么 Drizzle ORM

跨方言（SQLite / MySQL / PostgreSQL 兼容的写法约束）、轻量、迁移脚本可用 drizzle-kit 生成并按方言维护。配套自研两道防线：

- **四份表定义对拍**（`pnpm db:check`）：`schema.ts` / `schema.mysql.ts` / 两份 DDL 逐一比对列 / 索引 / 外键 / CHECK，防手改漂移；
- 手写跨方言 DDL 为准，drizzle-kit 生成迁移对照。

### 为什么不引 Pinia / vue-query / i18n

- 全局状态只有四类（会话、当前项目上下文、类目全量、UI 状态），`useState` + composables 足够，零新增依赖；
- 取数模式是「进页面拉一次 → 操作后重拉」，没有复杂缓存失效需求；
- 4~15 人单团队中文界面，界面文案中文硬编码，i18n 不值当。

### 权限：双保险模型

- **前端**：`app/utils/permission.ts` 导出 15 个语义化判定函数（`canCreateIssue` / `canDeleteIssue` / `canChangeStatus`…），页面不写裸角色比较；作用是「别让人点到注定 403 的按钮」（体验层）；
- **服务端**：`server/utils/authz.ts` 统一落点 `requireProjectMember` + `assertCan`，**逐请求独立校验**（安全边界），禁止在路由里散写 `role ===` 判断；
- 前端判权漏了不会造成越权，错了会让人困惑 —— 若服务端返回前端认为不可能的 `PERM_*` 码，按前端 bug 处理。

### 数据隔离：projectId 强制进路径

所有业务接口路径必须含 `projectId`（`/api/v1/projects/:projectId/...`），**禁止设计「只按 issueId 操作」的端点** —— `issueId` 不含项目信息，跨项目越权只会从这个口子进来。配套三道防线：

1. SQL 的 `WHERE` 必须带 `project_id`；
2. 不用「先按 id 查出来再判断归属」的两步式写法；
3. 子表冗余存 `project_id` 并参与**复合外键**（`(issue_id, project_id) → issues(id, project_id)`），让「A 项目的问题挂 B 项目的类目」这种组合在数据库层直接被拒，不管是谁写的、是不是 AI 批量灌的。

### AI：代理执行制（单模式）

AI 在 `users` 表占一行（`subject_type='ai'`），**不能登录、不持有凭据、不加入项目**。唯一的写通道是「代理执行」：借人的 Token + `X-Agent-Mode: on-behalf` + `X-Agent-Id`，权限 = 发令人权限 ∩ AI 允许动作清单。设计取舍详见 [设计决策记录](/design/decisions)。

### 留痕与幂等

- 每个写操作在同一事务内写 `audit_log`：`actor_id`（实际操作者，永远有值）+ `commander_id`（发令人，仅 AI 代执行时有值）+ `agent_id` + `channel`（web/api/ai）+ `changes`（字段级 before/after，diff 为空不落行；长正文只记字数）；
- 批量写必带 `Idempotency-Key`，`idempotency_key` 表存请求指纹与首次响应，重放原样返回 —— 网络中断重试不会重复建问题。作用域为 `(actor_id, key)`。

## 前端架构

### 取数：useApi 单通道

`app/` 下禁止裸 `$fetch('/api/v1/...')`，全部请求经 `useApi`（约 11 个分域封装 `useIssueApi` / `useProjectApi` / `useMemberApi`…）：自动拼 `/api/v1` 前缀与当前项目 ID、解包 `{items, page}` 列表壳、按错误码 `code` 翻译中文提示、注入幂等键。SPA 下用 `$fetch` 而非 `useFetch`（后者的 SSR 预取价值在 `ssr:false` 下归零），列表统一走 `useAsyncList`（loading / error / data / refresh 四件套 + getter 为唯一取数触发点）。

### 状态：useState 登记制

全局状态集中登记（`me` / `tags` / `issue-filters:<页面>` / `me-issue-scope` / 两个 pending 标记），禁止页面随手 `useState('some-key')`。派生值（当前项目、我的角色）从 `me` 派生，不存第二份。筛选 / 排序 / 分页条件存 `useState` 不进 URL（明确接受「刷新丢、后退直接退出列表页」的代价）。

### 图片：Blob 化展示

四类图（附件原图 / 缩略图 / 项目封面 / 头像）一律过接口鉴权后以 blob 取回、`URL.createObjectURL` 展示、用完 revoke —— 不静态暴露目录，`<img src>` 直挂不可行。图片不做长期缓存（用完即丢；缓存要管销毁时机，出错代价高于重复下载）。

### 类型：shared/ 单一来源

接口类型按域拆在 `shared/types/`（`issue` / `tag` / `project` / `member` / `export` / `admin` / `me` / `audit` / `api`），前后端共用一份，禁止页面就地重声明接口形状或写 `any`。后端字段未冻结前，前端在 composable 层做单点归一（认不出的值按域降级：列表类宁缺毋滥、留痕类宁多勿少）。

## 后端分层

```
server/
├─ api/            # 路由层：参数校验（zod）→ 调 authz → 业务
├─ utils/
│  ├─ authz.ts     # 权限统一落点（唯一允许写角色判断的地方）
│  ├─ issue.ts     # 问题域公共查询（列表/详情的读端形状）
│  ├─ webp.ts      # 截图规范化（服务端兜底转 WebP）
│  ├─ thumb.ts     # 缩略图生成（jimp，PNG 480px）
│  ├─ mime.ts      # 上传白名单：扩展名 + 魔数双判
│  └─ storage.ts   # 存储路径（data/uploads/<项目ID>/...）
│  └─ exportTask.ts# 带图导出的进程内后台任务
├─ database/
│  ├─ schema.ts / schema.mysql.ts   # 双方言表定义
│  ├─ time.ts      # 时间统一转换（SQLite TEXT / MySQL DATETIME(3) → ISO8601 UTC）
│  └─ standard-tags.ts             # 41 项标准分类（代码里仅此一份）
└─ plugins/        # 错误体序列化钩子（h3 → 统一 {error:{code,message,details}}）
```

**写请求固定七步**（顺序不可调换）：解析凭据 → 校验项目存在（404）/ 成员身份（403）→ 权限断言（AI 通道再过滤动作清单）→ 业务前置校验 → 事务内落库 → 同事务写 audit_log → 返回。事务内严禁真实异步 I/O（文件一律先落盘再写库）。

## 文件处理管线

- **截图**：前端第一道（canvas 压缩：截图类 WebP 无损保持原尺寸、实拍类长边 1920 + q80）→ 服务端兜底（`normalizeShot`：已是 WebP 且 ≤1920 原样存，否则解码压缩，先试无损、无损更大退 q80，失败原样存绝不丢图）；
- **缩略图**：服务端按需生成（jimp，纯 JS，PNG，最长边 480，不入库按记录 ID 推导路径）；
- **过程附件**：原样存、不压缩、只提供下载（`Content-Disposition: attachment`，杜绝存储型 XSS）；类型白名单 + 魔数双判（四道关：体积数量 → 扩展名 → 内容与扩展名相符 → Content-Type 校验）；
- **头像 / 封面**：上传替换即覆盖；头像前端裁剪 256×256 WebP。

## 导出管线

| 档 | 实现 |
|---|---|
| Excel（10.1） | 服务端 exceljs 同步流式（边生成边吐） |
| 带图 HTML（10.2–10.4） | 服务端后台任务（进程内，重启即失效）+ fflate 流式写盘；按累计体积 3.5 GB 贪心切包、按问题编号升序装包；产物落 `data/exports/`；前端轮询任务状态 |
| Word（第 3 档） | 纯前端：4.1 拿列表（带 `shots[]` 截图指针）→ 6.2 拉原图 → canvas 转 JPEG（docx 库不认 WebP）→ docx 组装下载；服务端零参与 |
