# filename: README.md

# 船舶物料申请系统 · 灵韵旗舰版

一个离线可用、加密存储的船舶物料申请与物料库管理工具。零构建、零依赖、纯静态。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 一、项目简介

**船舶物料申请系统** 面向船舶物料申请流程设计，用于维护 IMPA 标准物料库（中英文双库）、生成专业格式的物料申请单、批量导入导出 Excel 数据。

所有数据使用 **AES-256-GCM** 加密后写入浏览器 IndexedDB，**不依赖任何后端服务，不上传任何数据到服务器**。整个应用零构建、零 npm 依赖，`git push` 即完成部署。

### 核心特征

- **端到端加密**：PBKDF2 派生密钥 + AES-256-GCM 认证加密，所有数据在写入存储之前完成加密
- **命令-查询分离架构**：单一数据源 + 单向数据流，所有状态变更必须通过 `commands/` 层的纯函数
- **原生 ES Modules**：零构建、零打包器、零转译，直接由浏览器加载
- **分块存储**：物料库按 5000 条一片分片加密，支持 15 万+ 条物料
- **中英文双库**：IMPA 中文库 + 英文库，独立维护、独立导出
- **Excel 导入导出**：支持 CN/EN 双工作表、覆盖/合并两种模式、来源筛选
- **统一模态框体系**：确认、输入、选项选择、编辑、密码、导出、回收站、损坏恢复等场景统一使用自定义模态框，避免原生 `prompt`/`confirm` 的体验差异
- **审计日志**：所有关键操作记录日志，可加密导出
- **数据损坏保护**：解密失败时阻塞写入并保留原始密文
- **离线优先**：首次访问后可完全离线使用（除 XLSX 与 localforage 的 CDN 首加载外）
- **移动端适配**：响应式布局，兼容苹果、华为手机的 Chrome 与 QQ 浏览器

---

## 二、快速开始

### 环境要求

- 任意现代浏览器（Chrome 100+ / Edge 100+ / Firefox 100+ / Safari 16+）
- 一个本地 HTTP 服务（ESM 不支持 `file://` 协议）

### 本地运行

方式一：Python 内置服务器

    python3 -m http.server 8080

方式二：Node.js

    npx serve

方式三：VS Code Live Server 插件

在 VS Code 中打开项目，右键 `index.html` → **Open with Live Server**。

启动后浏览器访问：

    http://localhost:8080

### 部署到静态托管

本项目为纯静态站点，可直接部署到任意静态托管平台：

- **GitHub Pages**：推送仓库到 `main` 分支
- **Netlify / Vercel / Cloudflare Pages**：连接 Git 仓库，构建命令留空，发布目录设置为 `/`
- **自建服务器**：直接上传整个目录到 Nginx / Apache 的静态目录即可

> 部署到子路径时无需额外配置，所有资源路径均使用相对路径。

### 预设物料库（可选）

项目支持通过 `scripts/data/impa-default.xlsx` 生成内置预设物料库。若无需预设数据，可跳过本节。

**准备**：将含 `CN` 与 `EN` 两张 sheet 的 Excel 放到 `scripts/data/impa-default.xlsx`。

**一键生成**：双击项目根目录的 `build.bat`。

**手动生成**：

    cd scripts/tools
    npm install --no-save xlsx
    node generate-preset.js
    node check-preset-gaps.js

生成成功后，`src/preset.js` 将包含中英文预设物料库。

---

## 三、使用指南

### 3.1 首次使用

首次打开应用会要求设定主密码（至少 6 位）。该密码用于派生 AES-256 加密密钥，**请务必牢记**：密码丢失后数据无法恢复。

### 3.2 物料申请单管理

- **填写申请单头**：申请次序号、申请人、申请时间（三输入框修改会立即同步到 Vault 并持久化）
- **添加物料**：
  - 通过「闪电添加」搜索 IMPA 或描述
  - 通过「从物料库选择」批量添加
  - 通过「导入申请单」从 Excel 载入
- **修改数量 / 库存 / 备注**：直接在表格中编辑
- **导出申请单**：生成 CN / EN 双工作表 Excel
- **保存 / 加载 / 新建**：保存当前申请单到加密存储；从历史列表加载；创建空白申请单

> **注**：应用会在 localStorage 中记录"上次查看的申请单 reqNo"，重新打开时自动恢复。

### 3.3 智能物料库

- **搜索**：支持 IMPA、描述、规格、单位、备注多字段检索
- **分页**：30 / 50 / 100 / 200 条每页
- **快速添加**：单条录入自定义物料
- **批量导入**：从 Excel 追加或覆盖，支持 CN / EN 双表
- **编辑 / 删除**：单条维护（点击单元格或编辑按钮均可打开编辑弹窗）
- **中英切换**：顶栏语言切换按钮

### 3.4 数据备份与恢复

- **导出备份（JSON）**：加密备份，含物料库、回收站与全部申请单
- **导出备份（Excel）**：明文备份，可选物料库 / 申请单、来源筛选
- **导入备份**：从 JSON 恢复，支持覆盖 / 合并两种模式；回收站合并遵循"最新在前"语义

### 3.5 审计日志

顶栏「审计日志」按钮可查看操作历史（加密导出或直接查看最近 100 条）。

### 3.6 修改密码

顶栏「修改密码」按钮修改主密码时，会**全量重加密所有数据**（含物料库、申请单、回收站、审计日志）。若中途失败，自动回滚到原密码与原始数据。

### 3.7 数据损坏恢复

若检测到解密失败（例如密钥不匹配、数据损坏），系统会阻塞写入并弹出恢复选项：

- **重置系统**：清空所有数据，重新开始
- **标记为正常**：仅当确认数据完整性无问题时使用

---

## 四、键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl / Cmd + K` | 聚焦当前 Tab 对应的搜索框（申请单 Tab → 申请单过滤；物料库 Tab → 物料库搜索） |
| `Esc` | 按"模态框 → 清空搜索"优先级依次处理 |
| `Delete` | 删除已勾选的申请单项 |
| `Enter` | 模态框内提交 |

**Esc 优先级链（从高到低）**：

1. 确认对话框（`confirm.js`）
2. 输入模态框（`confirm-input.js`）
3. 选项模态框（`confirm-choice.js`）
4. 编辑物料模态框（`edit-material.js`）
5. 修改密码模态框（`change-password.js`）
6. 导出备份模态框（`export-backup.js`）
7. 回收站面板（`recycle-bin-modal.js`）
8. 数据损坏恢复模态框（`corruption-recovery.js`）
9. 清空当前搜索关键词

---

## 五、数据安全

### 5.1 加密方案

| 项目 | 实现 |
|---|---|
| 对称加密算法 | AES-256-GCM（认证加密，防篡改） |
| 密钥派生函数 | PBKDF2-SHA256 |
| 迭代次数 | 210,000 |
| 密钥长度 | 256 位 |
| 初始向量（IV） | 12 字节随机数，每次加密重新生成 |
| 存储格式 | `v3::[12 字节 IV][密文 + AuthTag]` 的 Base64 编码 |

### 5.2 存储位置

| 存储介质 | 用途 |
|---|---|
| IndexedDB | 加密后的物料库分片、申请单、回收站、审计日志 |
| localStorage | UI 状态（当前 tab、排序、列宽等）、上次查看的申请单号 |
| sessionStorage | 无 |

### 5.3 隐私保证

- **无网络请求**：除 XLSX 与 localforage 的 CDN 首加载外，无任何外部请求
- **无遥测**：不收集任何使用数据
- **无账号**：不需要注册、登录，数据完全存储在用户浏览器内
- **无后端**：不存在服务器端数据泄露风险

### 5.4 内容安全策略（CSP）

`index.html` 中声明了严格的 CSP：

- `default-src 'self'`
- `script-src 'self'` + XLSX / localforage CDN 白名单
- `frame-ancestors 'none'`（防点击劫持）
- `base-uri 'self'`（防 `<base>` 标签注入）
- `form-action 'self'`
- `worker-src 'none'`

### 5.5 数据备份与恢复

`core/corruption.js` 实现了**解密失败保护**：

- 场景：用户的加密数据在当前环境中无法解密
- 行为：阻塞所有写操作，避免损坏数据被新数据覆盖
- 提示：通过模态框引导用户选择恢复路径

---

## 六、架构概览

### 6.1 命令-查询分离

整个应用遵循**单一数据源 + 单向数据流**的设计：

- **唯一数据源**：`src/core/facade.js` 中维护的 `currentVault`
- **唯一写入路径**：所有变更必须通过 `dispatch(commandName, payload)` 分发到 `src/commands/` 下的纯函数
- **只读访问**：通过 `query(vault => ...)` 获取视图需要的数据
- **切片订阅**：视图通过 `subscribe('materials' | 'application' | 'recycleBin' | 'ui' | 'settings' | 'meta', handler)` 订阅变更

**所有命令函数均为纯函数**：输入旧 Vault，输出新 Vault，绝不修改入参。

### 6.2 分层结构

    +----------------------------------------------------------+
    |  views/    视图层（DOM 渲染 + 事件派发）                  |
    |    ^ 订阅 slice / v dispatch 命令                         |
    +----------------------------------------------------------+
    |  commands/ 命令层（纯函数，业务逻辑）                      |
    |    ^ 使用纯查询 / v 通过 facade 更新状态                  |
    +----------------------------------------------------------+
    |  core/     核心层                                        |
    |    . facade.js     - 状态协调 + 持久化触发                |
    |    . vault.js      - 状态形状 + 纯查询                    |
    |    . persist.js    - 分块加密读写                        |
    |    . repository.js - IndexedDB 仓储                      |
    |    . crypto.js     - AES-256-GCM 加解密                  |
    |    . auth.js       - 认证与密码管理                      |
    |    . corruption.js - 数据损坏保护                        |
    |    . audit-log.js  - 审计日志                            |
    +----------------------------------------------------------+
    |  services/ 服务层（数据流管道）                          |
    |    . import-pipeline - Excel 导入管道                    |
    |    . export-suite    - Excel / JSON 导出                 |
    +----------------------------------------------------------+
    |  utils/    工具层（无业务语义）                          |
    +----------------------------------------------------------+

### 6.3 Vault 顶层结构

    vault = {
        materialsEn:         [{ impa, description, specification, unit, remark, source }],
        materialsZh:         [{ impa, description, specification, unit, remark, source }],
        currentApplication:  { reqNo, applicant, applyTime, items: [...] },
        recycleBin:          [{ id, language, material, deletedAt, deletionSource }],
        ui:                  { activeTab, currentLang, ... },   <- 会话级瞬态
        settings:            { ... },                            <- 用户偏好，跨会话持久
        meta:                { dataCorruptionDetected }
    }

### 6.4 切片语义

| 切片 | 消费方 |
|---|---|
| `'materials'` | `material-table.js`、`quick-add.js` |
| `'application'` | `request-table.js`、`history-list.js`、`main.js`（记录上次查看的 reqNo） |
| `'recycleBin'` | `main.js` 的回收站徽章 |
| `'ui'` | 各视图的 tab / 语言 / 排序 / 过滤 / 分页 |
| `'settings'` | 预留 |
| `'meta'` | 数据损坏标志消费方（纯快照；权威状态在 corruption.js） |

### 6.5 持久化策略

命令可通过 `persistMode` 指定持久化行为：

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `immediate`（默认） | 命令执行后立即加密写入 | 增删改等关键操作 |
| `debounced` | 400ms 防抖写入 | 搜索输入、备注输入、列宽拖拽 |
| `skip` | 完全不持久化 | 仅瞬态 |

### 6.6 模态框体系

所有用户交互模态框均遵循统一模式：

- 每个模态框模块导出 `openXxxModal` 与 `forceCloseXxxModal`
- DOM 动态创建并注入 body（不在 `index.html` 中预置）
- 使用 `modal-overlay` / `modal-card` / `modal-actions` 类族
- 无障碍属性：`role="dialog"` / `aria-modal="true"` / `aria-labelledby`
- Enter 提交，Esc 关闭（由 `shortcuts.js` 的关闭链统一调度）
- 并发保护：若已有未关闭的对话框，先以合理值关闭旧的

现有模态框清单：

| 模块 | 用途 |
|---|---|
| `modals/confirm.js` | 通用确认对话框（确定 / 取消） |
| `modals/confirm-input.js` | 通用单行输入（替代 `prompt`） |
| `modals/confirm-choice.js` | 通用选项选择（替代 `prompt` 的数字选择） |
| `modals/edit-material.js` | 编辑物料 |
| `modals/change-password.js` | 修改主密码 |
| `modals/export-backup.js` | 导出备份 |
| `modals/recycle-bin-modal.js` | 回收站面板 |
| `modals/corruption-recovery.js` | 数据损坏恢复 |

---

## 七、项目目录结构

    ship-material-system/
    +-- index.html
    +-- README.md
    +-- LICENSE
    +-- .gitignore
    +-- build.bat
    +-- styles/
    |   +-- tokens.css
    |   +-- base.css
    |   +-- layout.css
    |   +-- tables.css
    |   +-- modals.css
    |   +-- toast.css
    +-- src/
    |   +-- main.js
    |   +-- constants.js
    |   +-- shortcuts.js
    |   +-- core/
    |   |   +-- vault.js
    |   |   +-- facade.js
    |   |   +-- persist.js
    |   |   +-- repository.js
    |   |   +-- storage-migration.js
    |   |   +-- crypto.js
    |   |   +-- auth.js
    |   |   +-- corruption.js
    |   |   +-- audit-log.js
    |   |   +-- selectors.js
    |   +-- commands/
    |   |   +-- registry.js
    |   |   +-- material-crud.js
    |   |   +-- material-batch.js
    |   |   +-- application-crud.js
    |   |   +-- application-items.js
    |   |   +-- ui-state.js
    |   |   +-- settings-crud.js
    |   |   +-- recycle-bin.js
    |   +-- utils/
    |   |   +-- dom.js
    |   |   +-- id.js
    |   |   +-- excel.js
    |   |   +-- format.js
    |   +-- services/
    |   |   +-- search.js
    |   |   +-- pagination.js
    |   |   +-- import-pipeline/
    |   |   |   +-- parser.js
    |   |   |   +-- validator.js
    |   |   |   +-- transformer.js
    |   |   |   +-- merger.js
    |   |   |   +-- writer.js
    |   |   |   +-- import-request.js
    |   |   +-- export-suite/
    |   |       +-- excel-export.js
    |   |       +-- json-export.js
    |   +-- views/
    |       +-- auth-view.js
    |       +-- request-table.js
    |       +-- material-table.js
    |       +-- quick-add.js
    |       +-- history-list.js
    |       +-- batch-import-ui.js
    |       +-- column-resize.js
    |       +-- recycle-card.js
    |       +-- toast.js
    |       +-- modals/
    |           +-- confirm.js
    |           +-- confirm-input.js
    |           +-- confirm-choice.js
    |           +-- edit-material.js
    |           +-- change-password.js
    |           +-- export-backup.js
    |           +-- corruption-recovery.js
    |           +-- recycle-bin-modal.js
    +-- scripts/
    |   +-- data/
    |   +-- tools/
    |       +-- generate-preset.js
    |       +-- check-preset-gaps.js
    +-- tests/
        +-- core/
        |   +-- vault.test.js
        +-- commands/
        |   +-- material-crud.test.js
        |   +-- application-crud.test.js
        |   +-- ui-state.test.js
        +-- utils/
        |   +-- id.test.js
        +-- services/
            +-- merger.test.js
            +-- import-pipeline/
                +-- validator.test.js
                +-- transformer.test.js
                +-- parser.test.js
                +-- writer.test.js

详见 `project-directory-tree.txt`。

---

## 八、浏览器兼容性

| 浏览器 | 最低版本 | 说明 |
|---|---|---|
| Chrome | 100+ | 完整支持（推荐） |
| Edge | 100+ | 完整支持（推荐） |
| Firefox | 100+ | 完整支持 |
| Safari | 16+ | 完整支持 |
| Chrome for Android | 100+ | 完整支持 |
| Firefox for Android | 100+ | 完整支持 |
| Safari for iOS | 16+ | 完整支持 |

**关键能力依赖**：

- Web Crypto API（`window.crypto.subtle`）
- ES Modules
- IndexedDB
- `Blob` / `URL.createObjectURL`

---

## 九、常见问题

### Q1：启动后页面空白 / 控制台报错

**原因**：通过 `file://` 协议打开 `index.html`，浏览器拒绝加载 ES Modules。

**解决**：改用 HTTP 服务启动。

### Q2：数据丢失 / 找回

**原因**：清空浏览器数据、切换浏览器、使用无痕模式等。

**解决**：

- 定期使用「导出备份」功能备份数据
- 换设备或换浏览器时，通过「导入备份」恢复

### Q3：修改密码后数据无法解密

**原因**：修改过程中页面被关闭或刷新。

**解决**：修改密码时请勿关闭页面。若失败，系统会自动回滚。刷新页面后重新登录即可。

### Q4：导入 Excel 时提示"缺少 IMPA 列"

**原因**：Excel 表头未包含 `IMPA` 字段（不区分大小写）。

**解决**：确保表头有 `IMPA` 列；可以包含其他列（描述、规格、单位、备注），但 IMPA 是必需列。
导入时系统会在前 10 行内探测表头，允许文件包含标题行。

### Q5：批量导入速度慢

**原因**：物料库条目较多时，每次导入都需重新分片加密。

**解决**：

- 减少每次导入的条目数
- 或合并多次导入为一次

### Q6：Ctrl+K 快捷键没反应

**原因**：可能焦点在某个输入框内（输入框内 Ctrl+K 不触发聚焦快捷键）。

**解决**：先按 Esc 释放焦点，或点击页面空白处，再按 Ctrl+K。

### Q7：导出文件名日期与本地日期不同

**原因**：早期版本使用 UTC 日期生成文件名，在东八区凌晨 0-8 点会得到"昨天"的日期。

**解决**：当前版本已修正为本地日期，导出文件名与实际日期一致。

---

## 十、开发约定

### 10.1 不可妥协的规则

1. **视图层不得直接操作 `currentVault`**：所有状态变更必须通过 `dispatch` 命令
2. **命令函数必须为纯函数**：输入旧 Vault，返回新 Vault，绝不修改入参
3. **不得在 `views/` 层引用 `persist.js`**：持久化由 `facade.js` 统一触发
4. **所有用户可控文本必须转义**：写入 DOM 之前必须经过 `escapeHtml`
5. **常量集中管理**：所有"魔数"必须定义在 `src/constants.js`
6. **模态框统一模式**：所有模态框必须实现 `openXxxModal` 与 `forceCloseXxxModal`，且必须加入 `shortcuts.js` 的 Esc 关闭链
7. **不使用原生 `prompt` / `confirm` / `alert`**：统一使用 `modals/` 下的自定义模态框

### 10.2 代码风格

- 使用 **原生 ES Modules**，不引入任何构建工具
- 使用 `const` 优先，其次 `let`，避免 `var`
- 大括号采用 **K&R 风格**
- 每个文件首行标注 `// filename: <path>`

### 10.3 提交信息规范

    <type>(<scope>): <subject>

    type: feat | fix | refactor | perf | docs | chore
    scope: core | commands | views | styles | config

---

## 十一、许可证

本项目采用 [MIT License](./LICENSE) 开源。

---

## 十二、致谢

- 图标：[Font Awesome 6](https://fontawesome.com/)
- Excel 处理：[SheetJS (XLSX)](https://sheetjs.com/)
- 存储：[localforage](https://localforage.github.io/localForage/)
- 字体：[Inter](https://rsms.me/inter/)