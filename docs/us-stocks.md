# 美股频道

入口：[美股资讯](https://0xaptx.github.io/ai-daily/#/news?topic=stocks)。首页、资讯频道筛选与日报均包含美股。

使用已有 GitHub Actions 每小时采集、保留 90 天历史；显示来源的真实发布时间，统一北京时间倒序。没有时间的来源只显示日期。沿用免费开源模型生成中文标题和短摘要，按批次覆盖，未生成的条目仍显示原文。

新增订阅入口（2026-10-21 实测 RSS 返回有效文章）：

| 来源 | 内容 | 订阅 |
|---|---|---|
| Yahoo Finance | 标普 500 相关市场新闻、指数与期货、公司报道 | [RSS](https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US) |
| CNBC Earnings | 全球公司财报，按美股信号跨频道归类 | [RSS](https://www.cnbc.com/id/15839135/device/rss/rss.html) |
| WSJ Markets | 全球市场报道，按美股信号跨频道归类 | [RSS](https://feeds.content.dowjones.io/public/rss/RSSMarketsMain) |
| AMD 投资者关系 | 财报、并购、公司公告 | [RSS](https://ir.amd.com/rss/news-releases.xml) |
| Intel 投资者关系 | 财报、公司公告 | [RSS](https://www.intc.com/news-events/press-releases/rss) |

美股专属订阅同时进入“投资市场”。美联储和 SEC 公告进入美股，作为美国政策监管背景。既有 CNBC、MarketWatch、FT、中文媒体与公司来源中，标题明确提到美股、华尔街、美股指数，或美国上市公司及财报/股价/并购等事件的条目也进入该频道。只含“股票”“财报”这样的泛词不会把法国、中国、日本的市场新闻直接归入美股。关键词规则存在遗漏和误分，保留出处便于核对。

RSS 只取标题及很短的发布方摘录，不绕过付费墙；WSJ、CNBC 等部分原文可能要求订阅。这里提供新闻阅读，不接入实时行情或交易功能。来源状态以网站信源目录本轮结果为准。
