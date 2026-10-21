# X 热帖接入

页面：<https://0xaptx.github.io/ai-daily/#/x>。目前默认关闭，不会产生 X API 费用。

## 我的 X 关注

已从 [@0xAPTX 的正在关注列表](https://x.com/0xAPTX/following) 导入 **27 个账号**，与主页显示的 27 个关注一致。导入时间保存在 `imports/0xaptx-following.json`；只记录公开账号名、显示名称和主页链接。

名单完整保留所有账号，包括大型机构和超过 10 万粉丝的账号。**“低于 10 万”只用于热帖检测的资格筛选，不会删除关注名单里的账号**。仍保留原来的 6 个补充候选，目前共 33 个观察账号。

这是一份本次导入的快照，已增加每日同步程序与 GitHub 定时任务；目前按用户选择保持未启用，因此后续新增或取消关注尚不会自动同步。不会访问浏览器登录会话。

## 每日自动同步关注名单

GitHub Actions 每天计划在**北京时间 07:43**运行（UTC 前一天 23:43，调度可能延迟），也可手动运行工作流检查。当前 `followingSync.enabled: false`，预算仍为 0，不会调用接口；页面明确显示未启用。

以后启用时：

1. 在 GitHub 仓库 Secrets 配置 `X_BEARER_TOKEN`，应用需要公开用户查询及读取 following 的权限。凭证只通过环境变量使用，不写入生成文件。
2. 在 `x-watchlist.json` 将 `followingSync.enabled` 改为 `true`，确认 `followingSync.owner` 为 `0xAPTX`，设置获批准的 `monthlyBudgetUsd` 并在 X 控制台配置硬性消费限额。
3. 根级 `enabled` 只控制热帖，可继续保持 `false`，因此可以只同步关注而不采集帖子。两个功能共用 `site/data/x-budget.json` 月度预留账本。
4. 手动运行 Update AI Daily，检查 `Sync X following once daily (opt-in, budget guarded)`，再查看网站每日同步状态。

程序通过官方用户查询解析账号 ID，再按页读取 `GET /2/users/{id}/following`。默认每页 100、最多 50 页；所有页完整、账号合法无重复且数量与 API 报告的关注数一致时才替换名单。新增关注自动加入，取消关注自动移除；原有 6 个补充候选独立保留。读取失败、分页截断或数量不一致时，保留上次完整名单，公开页面标记原因。同一北京时间日期成功后不再重复付费同步。

完整关注名单最多支持该分页上限；热帖一次最多核验前 100 个观察账号，超过时明确标为部分结果。关注名单本身不会因超过 10 万粉丝而删除账号。同步结果更新 `imports/0xaptx-following.json`、`x-watchlist.json` 及页面数据，并提交到已获授权的公开仓库。

[官方价格](https://docs.x.com/x-api/getting-started/pricing)目前 Following/Followers Read 为 $0.010/资源。按 27 个关注加 1 次用户查询，粗略约 $0.28/天、30 天 $8.40；实际取决于资源数与官方账单。程序先按整页 100 个预留，因此一页加用户查询保守预留 $1.01/天，不应把预留额当实际支出。符合官方 Owned Reads 条件的自有账号读取可能有较低单价，本程序不假定符合折扣。预算不足时停止调用，未配置时零调用。

官方接口示例：[X 官方 following 读取示例](https://github.com/xdevplatform/samples/blob/main/python/users/follow/get_following.py)。尚无凭证，当前验证覆盖程序与测试夹具，未验证实际账号 API 权限。

## 补充候选名单

已按用户选择初选 6 个账号，每类 2 个；这些是内容候选，不是已经核验粉丝数的合格监测账号。中文摘要继续使用免费模型，X 预算另议：`enabled: false`、`monthlyBudgetUsd: 0`，不会调用付费接口。

| 方向 | 候选账号 | 内容重点 | 公开资料依据 |
| --- | --- | --- | --- |
| AI | [@hamelhusain](https://x.com/hamelhusain) | AI 评估与 LLM 应用 | [本人博客](https://hamel.dev/) |
| AI | [@eugeneyan](https://x.com/eugeneyan) | AI 系统、检索与工程 | [本人网站](https://eugeneyan.com/) |
| 投资 | [@tsoh_investing](https://x.com/tsoh_investing) | 财报、商业模式与长期研究 | [本人访谈](https://acquirersmultiple.com/2025/02/value-after-hours-s07-e04alex-morris-on-buffett-and-munger-unscripted-msft-meta-goog-aapl-big-tech-cap-ex/) |
| 投资 | [@tominvesting](https://x.com/tominvesting) | 价值投资与公司分析 | [本人链接页](https://linktr.ee/investingwithtom) |
| 加密 | [@safetyth1rd](https://x.com/safetyth1rd) | DeFi 协议及生态 | [公开账号](https://x.com/safetyth1rd) |
| 加密 | [@mhonkasalo](https://x.com/mhonkasalo) | 链上研究与市场结构 | [公开账号](https://x.com/mhonkasalo) |

公开页面及搜索快照只用于初选，不写入实时粉丝数。正式启用时仍必须经过官方 API 核验，达到 100,000 粉丝、无法读取指标或受保护的账号都会排除。个人账号也会发布与主题无关的内容；热度门槛不等于观点正确。

## 配置

1. 在 [X Developer Console](https://console.x.com/) 创建有公开用户查询和最近搜索权限的开发者应用，获取 Bearer Token。购买额度前先确认当前价格及权限。
2. 到本仓库 Settings → Secrets and variables → Actions → New repository secret，名称填 `X_BEARER_TOKEN`，值填凭证。不要放在源码、网页或聊天里。
3. 修改根目录 `x-watchlist.json`：`usernames` 填账号名，不带 `@`；`enabled` 改为 `true`；`monthlyBudgetUsd` 填你批准的每月美元用量预算。默认 `0`，不调用 API。
4. 同时在 X 控制台设置消费限额。程序的 `site/data/x-budget.json` 是保守预留估计，重复读取、关联用户都按收费估计；它不是发票或账单硬限制。任务异常、手动重置文件等可能影响本地记账，硬限制以 X 控制台为准。
5. 在 GitHub Actions 中手动运行 Update AI Daily，检查 `Check configured X watchlist`。之后随同每两小时采集任务运行。打开网页只读已发布数据，不发起付费请求。

## 规则

- 每次通过官方用户接口核验粉丝数。只接纳 `0 ≤ followers_count < 100000` 且公开的账号；恰好 10 万、未知、失效或保护账号排除。无法查询的账号不会被当作零粉丝。
- 最近 48 小时公开原创帖，排除回复与转发；不断重读窗口可发现后续达到门槛的帖子。默认每轮最多 1 页、20 条；达到上限明确显示“部分结果”，可能漏帖。可设置最多 5 页、每页最多 100 条，费用随之增加。
- 热度分 = 点赞 + 2×转发 + 回复 + 2×引用。门槛 = max(50, ceil(粉丝数×0.5%))。这是本站配置规则，不代表 X 官方榜单或增长速度。
- 达标帖子按原始 `created_at` 倒序。互动是采样时的累计值，粉丝数同样有采样时间；历史采样不能保证当前粉丝数。
- 接口失败保留窗口内历史并展示失败状态；成功核验到达到 10 万粉丝的作者立即排除。
- 当前官方 OpenAPI 使用 `post.fields` / `note_post` / `repost_count`。部分旧版文档仍使用 `tweet.fields` / `note_tweet` / `retweet_count`。响应兼容两种名称；如果应用提示字段不兼容，可将 `legacyFields` 设为 `true`，不自动重复付费查询。
- 没有凭证时只进行测试夹具验证，不能宣称已验证该账号的真实接口权限与字段版本。

## 费用参考

2026-10-21 查阅[官方价格](https://docs.x.com/x-api/getting-started/pricing)：Post 读取 $0.005/条，User 读取 $0.010/个。若每天实际计费 200 条帖子、20 个用户，30 天约 $36。此例不包含更多关联用户或跨日重复计费，不是费用承诺。

默认每轮搜索 20 条及其关联用户，保守预留上限是 $0.30，再加监测账号查询：每账号 $0.01。每两小时重查时，月度预留可能比实际账单高很多；达到设置预算后会停止读取。官方同日去重仅是 soft guarantee，程序不把它当作固定折扣。

官方依据：[认证](https://docs.x.com/fundamentals/authentication/overview)、[用户查询](https://docs.x.com/x-api/users/get-users-by-usernames)、[最近搜索](https://docs.x.com/x-api/posts/search-recent-posts)、[OpenAPI](https://github.com/xdevplatform/docs/blob/main/openapi.json)。
