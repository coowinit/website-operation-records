# 网站运维工作记录系统

版本：`v1.2.1`

这是一个用于记录网站日常运维工作的轻量级管理系统，适合部署在支持 PHP 的服务器环境中，用于持续记录网站安全巡检、网站备份、询盘链路排查、网站更新留痕、SEO 巡检与整改等工作内容。

本项目最初是静态 HTML 记录页面，数据保存在浏览器本地。当前版本已经升级为 **HTML + CSS + JavaScript + PHP + SQLite** 架构，所有新增、编辑、删除、导入、恢复等操作都会写入服务器端 SQLite 数据库，适合长期维护和多人查看。

---

## 项目目标

本项目的目标不是做复杂 OA 系统，而是建立一套简单、稳定、可长期维护的网站运维记录系统。

它主要解决以下问题：

- 网站安全巡检是否有记录；
- 网站备份是否有清单；
- 询盘异常是否有排查过程；
- 网站页面更新是否有留痕；
- SEO 问题是否有整改记录；
- 运维资料、截图、报告、云文件是否有统一入口；
- 数据是否能长期保存在服务器，而不是只保存在浏览器中。

---

## 当前包含的记录表

系统默认包含 5 张运维记录表：

| 表格编号 | 表格名称 | 主要用途 |
|---|---|---|
| `table01` | 网站安全巡检表 | 记录网站安全检查、异常发现、处理情况和相关云文件 |
| `table02` | 网站备份清单 | 记录数据库、文件、整站等备份情况 |
| `table03` | 询盘链路异常排查清单 | 记录表单、邮箱、询盘流程等异常排查过程 |
| `table04` | 核心网站更新留痕表 | 记录重点页面、核心模块、内容更新和调整原因 |
| `table05` | SEO巡检及整改记录表 | 记录 SEO 问题、整改动作、影响页面和跟进情况 |

所有详细材料建议统一通过 **“云文件”** 字段跳转查看。页面中只保留基础索引信息，具体截图、报告、排查过程、整改说明等内容建议放在云盘、内部文档或项目资料目录中。

---

## 当前版本特点

- 使用 `index.html` 作为主页面；
- 使用 `css/style.css` 管理页面样式；
- 使用 `js/app.js` 负责前端交互和接口请求；
- 使用 PHP API 连接 SQLite 数据库；
- 使用 SQLite 保存所有表格配置和记录数据；
- 支持新增、编辑、删除记录；
- 支持刷新数据，从服务器重新读取最新记录；
- 新增独立 **数据管理** 入口；
- 备份、导入、导出、恢复默认模板集中到数据管理页面；
- 支持本地 JSON 导出；
- 支持本地 JSON 导入；
- 支持服务器端 JSON 备份；
- 支持服务器备份列表、下载、恢复和删除；
- 导入、恢复默认模板、从服务器备份恢复前会自动生成服务器备份；
- 支持 `api/health.php` 检查 PHP 和 SQLite 环境；
- 保留默认数据文件，首次运行时可自动初始化数据库。

---

## 与 v1.0.0 的主要区别

### v1.0.0 数据流

```text
records-data.js → app.js → 浏览器 localStorage
```

v1.0.0 是纯前端静态页面，新增、编辑、删除后的数据保存在当前浏览器本地。如果更换电脑、清理浏览器缓存或更换浏览器，需要依赖 JSON 文件导入恢复。

### 当前版本数据流

```text
SQLite 数据库 → PHP API → app.js → 页面渲染
```

当前版本已经改为服务器端保存数据：

- 页面打开后从 SQLite 数据库读取数据；
- 新增记录会写入 SQLite；
- 编辑记录会更新 SQLite；
- 删除记录会删除 SQLite 中的对应记录；
- 导入 JSON 会覆盖写入 SQLite；
- 导出 JSON 会从 SQLite 生成完整备份；
- 恢复默认模板会重新写入 SQLite。

---

## 推荐部署环境

服务器需要支持：

```text
PHP 7.4+
PDO
pdo_sqlite
SQLite3
```

如果是虚拟主机、SiteGround、宝塔面板、cPanel 等环境，需要确认 PHP 已经启用 SQLite 相关扩展。

上传服务器后，建议先访问：

```text
api/health.php
```

如果返回 `success: true`，说明 PHP + SQLite 环境基本可用。

如果提示：

```text
pdo_sqlite_loaded: false
```

说明当前 PHP 环境没有启用 `pdo_sqlite`，需要在主机面板中开启，或联系主机服务商处理。

---

## 文件结构

```text
website-operation-records/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   └── records-data.js
├── api/
│   ├── config.php
│   ├── db.php
│   ├── health.php
│   ├── records.php
│   └── seed.php
├── data/
│   └── default-records-data.json
├── database/
│   ├── .htaccess
│   └── schema.sql
├── backups/
│   ├── .gitkeep
│   └── .htaccess
└── README.md
```

---

## 主要目录说明

| 文件或目录 | 说明 |
|---|---|
| `index.html` | 系统主页面 |
| `css/style.css` | 页面样式文件 |
| `js/app.js` | 前端交互、表格渲染、接口请求逻辑 |
| `js/records-data.js` | 前端备用默认数据结构，主要用于兼容和参考 |
| `api/config.php` | 数据库路径、备份目录等基础配置 |
| `api/db.php` | SQLite 连接、建库、数据读写、备份恢复等核心逻辑 |
| `api/records.php` | 前端调用的统一数据接口 |
| `api/health.php` | PHP、SQLite、目录权限检测接口 |
| `api/seed.php` | 手动初始化默认数据接口 |
| `data/default-records-data.json` | 默认表格结构和初始化数据 |
| `database/schema.sql` | SQLite 建表语句 |
| `database/website_records.sqlite` | 首次运行后自动生成的 SQLite 数据库文件 |
| `backups/` | 服务器端 JSON 备份文件目录 |

---

## 第一次部署步骤

### 1. 上传文件

将项目文件上传到 PHP 网站目录，例如：

```text
/public_html/website-operation-records/
```

或者直接放到某个测试域名、子目录、内部访问目录中。

### 2. 检查环境

访问：

```text
https://你的域名/api/health.php
```

重点确认：

- PHP 是否正常运行；
- `pdo_sqlite` 是否已启用；
- `database/` 目录是否可写；
- `backups/` 目录是否可写。

### 3. 打开系统页面

访问：

```text
https://你的域名/index.html
```

第一次打开时，系统会自动：

1. 创建 SQLite 数据库文件；
2. 执行 `database/schema.sql` 建表；
3. 读取 `data/default-records-data.json`；
4. 将默认表格结构和默认记录写入 SQLite；
5. 前端从 SQLite 读取数据并渲染页面。

### 4. 手动初始化

如果需要手动初始化，可以访问：

```text
api/seed.php?token=change-this-token
```

正式使用前建议修改 `api/seed.php` 中的 token。初始化完成后，也可以删除或禁用 `seed.php`，避免误操作。

---

## 页面使用说明

### 业务记录页面

记录表菜单中默认包含：

```text
网站安全巡检表
网站备份清单
询盘链路异常排查清单
核心网站更新留痕表
SEO巡检及整改记录表
数据管理
```

前 5 个页面是业务记录页面，主要用于日常新增、编辑、删除记录。

业务页面保留的主要操作：

| 操作 | 说明 |
|---|---|
| 新增记录 | 在当前表格中新增一条记录 |
| 刷新数据 | 从 SQLite 数据库重新读取最新数据 |
| 编辑 | 修改当前行记录 |
| 删除 | 删除当前行记录 |

### 数据管理页面

`数据管理` 是全局数据入口，所有备份和恢复操作都集中在这里。

| 操作 | 说明 |
|---|---|
| 生成服务器备份 | 将当前 SQLite 数据导出为 JSON，并保存到服务器 `backups/` 目录 |
| 查看服务器备份列表 | 查看服务器中已有的备份文件 |
| 下载备份 | 下载某个服务器端 JSON 备份 |
| 恢复备份 | 使用某个服务器端备份覆盖当前 SQLite 数据 |
| 删除备份 | 删除不需要的服务器端备份文件 |
| 导出完整 JSON | 将当前 SQLite 数据导出到本地电脑 |
| 导入 JSON 备份 | 使用本地 JSON 文件覆盖当前 SQLite 数据 |
| 恢复默认模板 | 用默认模板覆盖当前 SQLite 数据 |

> 注意：数据管理页面中的导入、导出、备份、恢复操作都是 **全局操作**，影响的是整套系统数据，不是单独某一张业务表。

---

## 主要接口说明

| 接口 | 方法 | 作用 |
|---|---|---|
| `api/records.php?action=all` | GET | 获取全部表格和记录 |
| `api/records.php?action=create` | POST | 新增记录 |
| `api/records.php?action=update` | POST | 更新记录 |
| `api/records.php?action=delete` | POST | 删除记录 |
| `api/records.php?action=import` | POST | 导入 JSON 备份并覆盖数据库 |
| `api/records.php?action=export` | GET | 从数据库导出完整 JSON |
| `api/records.php?action=reset` | POST | 恢复默认模板 |
| `api/records.php?action=backup` | POST | 生成服务器端 JSON 备份 |
| `api/records.php?action=backups` | GET | 获取服务器端备份列表 |
| `api/records.php?action=download_backup` | GET | 下载服务器端备份 |
| `api/records.php?action=restore_backup` | POST | 从服务器端备份恢复数据库 |
| `api/records.php?action=delete_backup` | POST | 删除服务器端备份 |

---

## SQLite 数据库设计

本项目没有把 5 张业务表拆成 5 个固定数据库表，而是采用更灵活的结构。

### `record_tables`

用于保存每张表的配置，例如：

- 表格编号；
- 表格标题；
- 菜单标题；
- 表格说明；
- 字段配置；
- 排序信息。

### `record_rows`

用于保存每一条业务记录。每条记录的具体字段以 JSON 保存，因此后期新增列、删除列、新增表格时，不需要频繁修改数据库表结构。

这种设计适合当前项目，因为网站运维记录表的字段未来可能继续调整。

---

## 数据备份说明

### 1. 本地 JSON 备份

进入 `数据管理` 页面，点击：

```text
导出完整 JSON
```

系统会从 SQLite 数据库导出完整数据，并下载到本地电脑。

建议命名格式：

```text
YYYY-MM-DD-HHMM-operation-records.json
```

例如：

```text
2026-07-09-1530-operation-records.json
```

### 2. 服务器端备份

进入 `数据管理` 页面，点击：

```text
生成服务器备份
```

系统会将当前 SQLite 数据导出为 JSON，保存到：

```text
backups/
```

备份文件示例：

```text
website-work-record-backup-20260709-091500-manual.json
website-work-record-backup-20260709-092000-before-import.json
website-work-record-backup-20260709-093000-before-reset.json
website-work-record-backup-20260709-094000-before-restore.json
```

### 3. 自动备份机制

以下高风险操作执行前，系统会自动生成服务器端备份：

| 操作 | 自动备份目的 |
|---|---|
| 导入 JSON 备份 | 防止导入错误文件后无法回滚 |
| 恢复默认模板 | 防止误覆盖正式数据 |
| 从服务器备份恢复 | 防止恢复错版本后无法回滚 |

---

## 数据库和备份文件安全

默认数据库路径：

```text
database/website_records.sqlite
```

默认服务器备份路径：

```text
backups/
```

项目已经在以下目录中加入 `.htaccess` 访问限制：

```text
database/.htaccess
backups/.htaccess
```

如果服务器支持，建议把数据库文件和备份目录移动到网站根目录之外，然后修改：

```text
api/config.php
```

中的路径配置：

```php
'db_path' => dirname(__DIR__) . '/database/website_records.sqlite',
'backup_dir' => dirname(__DIR__) . '/backups',
```

---

## 公开仓库注意事项

如果 GitHub 仓库是公开仓库，不建议上传真实工作数据。

以下内容建议不要上传到公开仓库：

- `database/website_records.sqlite`
- `backups/*.json`
- 真实网站名称；
- 内部服务器信息；
- 云文件私密链接；
- 客户询盘资料；
- 账号、密码、Token、API Key；
- 任何公司内部敏感信息。

推荐做法：

```text
backups/
├── .gitkeep
├── example-operation-records.json      # 示例备份，可以上传
└── private/                            # 真实备份建议本地保存，不上传
```

正式数据库和真实备份建议只保存在服务器、公司内部网盘或私有仓库中。

---

## 日常使用建议

1. 日常新增、编辑、删除记录，直接在对应业务表页面操作。
2. 每次批量修改前，先进入 `数据管理` 页面生成服务器备份。
3. 大版本更新前，建议同时保存两份备份：
   - 导出完整 JSON 到本地电脑；
   - 生成服务器端备份。
4. 不要把真实 SQLite 数据库和真实 JSON 备份上传到公开仓库。
5. 如果页面提示接口连接失败，优先访问 `api/health.php` 检查环境。
6. 如果更换服务器，建议先导出 JSON 备份，再在新服务器导入恢复。
7. 如果多人使用，建议后期增加登录权限和操作日志。

---

## 常见问题

### 1. 页面打不开，或者数据加载失败怎么办？

先访问：

```text
api/health.php
```

检查 PHP、SQLite、目录权限是否正常。

### 2. 提示 `pdo_sqlite_loaded: false` 怎么办？

说明服务器 PHP 没有开启 SQLite 扩展。需要在主机面板中启用 `pdo_sqlite`，或联系主机服务商开启。

### 3. 新增、编辑、删除后数据保存在哪里？

保存在服务器端 SQLite 数据库中：

```text
database/website_records.sqlite
```

不再依赖浏览器 `localStorage` 作为正式数据源。

### 4. 数据管理里的备份是单表备份吗？

不是。当前版本的备份、导入、导出、恢复默认模板都是全局操作，影响整套系统数据。

### 5. 可以新增表格或字段吗？

可以。当前数据库采用“表配置 + 行数据 JSON”的方式，后期新增字段和新增表格相对灵活。不过如果要通过页面直接管理字段，建议后续单独开发“表格配置管理”功能。

---

## 版本记录

### v1.2.1

- 新增独立 `数据管理` 入口；
- 移除业务表页面中的导入、导出、备份、恢复默认模板按钮；
- 每个业务表页面只保留新增记录、刷新数据、编辑、删除；
- 全局备份相关功能集中到数据管理页面；
- 优化页面文案，明确备份是全局备份，不是单表备份；
- 保留 v1.2.0 的服务器备份、恢复、下载、删除和自动备份保护能力。

### v1.2.0

- 新增服务器端备份按钮；
- 新增服务器端备份列表；
- 支持服务器备份下载、恢复、删除；
- 导入 JSON 前自动生成服务器备份；
- 恢复默认模板前自动生成服务器备份；
- 从服务器备份恢复前自动生成服务器备份；
- `api/health.php` 增加备份目录权限检测；
- 清理后端读取数据时重复执行查询的小问题。

### v1.1.0

- 新增 PHP API；
- 新增 SQLite 数据库建表结构；
- 新增默认数据 JSON；
- 页面数据改为从 SQLite 读取；
- 新增、编辑、删除写入 SQLite；
- 导入 JSON 备份写入 SQLite；
- 导出备份从 SQLite 生成；
- 增加环境检测接口 `api/health.php`。

### v1.0.0

- 完成单页静态记录表结构；
- 完成 5 张网站运维记录表；
- 完成 `table01 ~ table05` 数据组织方式；
- 完成页面内新增、编辑、删除记录；
- 完成浏览器本地保存；
- 完成 JSON 数据导入、导出备份；
- 完成恢复默认模板；
- 完成必要中文注释，方便后续修改。

---

## 后续可扩展方向

后续如果继续升级，可以考虑：

- 增加登录权限；
- 增加操作日志；
- 增加按日期、网站名称、关键词筛选；
- 增加记录编号自动生成；
- 增加表格字段配置管理；
- 增加定期自动备份；
- 增加 SQLite 数据库下载功能；
- 增加多用户角色权限；
- 增加上传附件或云文件管理入口。

---

## 适用场景

- 公司内部网站运维记录；
- WordPress 网站维护记录；
- 外贸网站询盘链路排查记录；
- SEO 巡检整改记录；
- 网站备份管理记录；
- 网站安全巡检记录；
- 小团队轻量级运维留痕系统。

---

## 说明

本项目适合轻量级网站运维记录，不适合作为大型权限管理系统或复杂工单系统。它更适合用于建立清晰、可追溯、可备份的网站运维工作台账。
