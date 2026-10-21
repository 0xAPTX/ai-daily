# X 热帖接入

页面：<https://0xaptx.github.io/ai-daily/#/x>。目前默认关闭，不会产生 X API 费用。

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
