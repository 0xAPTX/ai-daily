# 知新 · 多源资讯站

在 GitHub Pages 上运行的个人阅读站，组织方式参考 [wqu.guru](https://wqu.guru/)，直接采集各发布方公开来源。网站地址：https://0xaptx.github.io/ai-daily/

## 当前功能

- 六频道首页：AI、投资市场、产品商业、开发工具、学术研究、加密 Web3。
- 资讯流按发布时间排序，可筛中文、来源类型、关键词、主题和日期。
- 每日日报按真实发布日期编排，每个频道最多六条，优先中文与不同发布方。
- 站内热点按过去 24 小时标题关键词计数；不代表全网热度。
- 信源目录显示配置数、读取结果、最近活跃、语言和类型，可在当前浏览器隐藏来源。
- 来源详情和原文链接、原文摘录、更新/发布时间依据、预发布和安全更新标记。
- 收藏快照、已读记录、收藏 JSON 导出、全局搜索、深浅主题和手机布局。
- `site/feed.xml` 提供 RSS 订阅；`site/sources.opml` 导出 RSS 来源。

## 来源与覆盖

首批扩充至 **86 个订阅入口**，其中 **11 个中文来源**。入口数量与独立发布方数量不同；每次构建会重新计算实际状态。

- 国内：DeepSeek 官方更新、量子位、雷峰网、少数派、36氪、钛媒体、爱范儿、InfoQ 中文、Solidot、人人都是产品经理、PANews。
- AI 与研究：OpenAI、Anthropic、Google、Microsoft Research、Apple ML、Ai2、Berkeley、MIT、arXiv 等。
- 工具：Ollama、vLLM、llama.cpp、LangChain、LlamaIndex、Transformers、Diffusers、MLX、Dify、n8n、ComfyUI 等官方版本订阅。
- 市场与 Web3：美联储、美国 SEC、欧洲央行、日本央行、英格兰银行、CNBC、FT、MarketWatch、CoinDesk、Ethereum、Vitalik、a16z crypto 等。

信息源配置在 `sources.json`。`rss` 适配器支持 RSS/Atom/RDF；Anthropic 从新闻列表发现文章并读取 `NewsArticle.datePublished`，DeepSeek 从中文官方更新页的明确日期 H2 拆分条目。不会拿 sitemap 修改日期当作发布时间。

X、微信公众号、Telegram、登录或付费墙后的内容未接入。Qwen 当前博客未找到可读取的稳定日期接口，旧博客和空发布订阅未计入有效来源。Hugging Face 包含社区作者内容，标为社区来源。

## 编排与数据边界

当前版本 **不调用模型、不需要密钥**。中文来自中文源，英文保留原文。摘录直接来自发布方，未生成中文翻译、重要性分析或每日叙事综述。

最新资讯按来源时间排序。“多源编排”优先时效、中文与发布方多样性，限制同一来源数量，排除预发布及明显促销标题；不代表人工精选。分类与话题使用中英文关键词规则，可能有误。

同一 URL 去重，arXiv 同论文不同分类/版本合并；同标题且相近时间的不同发布方可归并显示。未做跨语言语义事件去重，不把多个 arXiv 分类当成多个独立发布方。

保留最近 90 天已经采集的记录。首次接入的历史深度由来源 feed 提供，无法保证每一天或每个来源完整。首页/近期索引按频道、来源和发布方限量，完整内容写入 `site/data/archive/YYYY-MM-DD.json`，访问历史日期时按需加载。

收藏、已读、隐藏来源和主题保存在当前浏览器，不跨设备同步，清除网站数据会删除。已收藏文章保存快照，超出公共归档期仍可在该浏览器查看和导出。

## 更新与部署

`.github/workflows/daily.yml` 计划每两小时在第 17 分钟采集，提交生成的数据并部署到 GitHub Pages。GitHub 调度可能延迟，公开仓库长期无活动时可能暂停；请查看 Actions 实际结果。

单源失败保留历史并展示失败状态；正常但没有近 90 天有效内容显示“暂无近期内容”；全部来源失败时中止当次发布。仅 `site/` 目录发布到 Pages。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/collect.py
node --check site/app.js
python3 -m http.server 8765 --directory site --bind 127.0.0.1
```

只需要 Python 3.9+ 和 curl，无第三方依赖。参考 [GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
