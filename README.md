# 知新 · 多源资讯站

在 GitHub Pages 上运行的个人阅读站，组织方式参考 [wqu.guru](https://wqu.guru/)，直接采集各发布方公开来源。网站地址：https://0xaptx.github.io/ai-daily/

## 当前功能

- 首页时间线按北京时间倒序，另保留七频道浏览：AI、投资市场、美股资讯、产品商业、开发工具、学术研究、加密 Web3。
- 资讯流按发布时间排序，可筛中文、来源类型、关键词、主题和日期。
- 每日日报按真实发布时间倒序，每个频道最多六条；来源仅提供日期时不补造时分。
- 中文标题和摘要：GitHub runner 内运行开源 Qwen 模型，增量生成，保留原文与覆盖进度。
- X 关注名单：已导入 @0xAPTX 的 27 个已关注账号，保留 6 个补充候选；全部名单与热帖资格分开，来源与导入时间可核对。
- X 热帖监测页及官方 API 接入程序：低于 10 万粉丝的指定账号、互动门槛、采样时间和原帖时间线。默认未启用，见 [接入说明](docs/x-setup.md)。
- 站内热点按过去 24 小时标题关键词计数；不代表全网热度。
- 信源目录显示配置数、读取结果、最近活跃、语言和类型，可在当前浏览器隐藏来源。
- 来源详情和原文链接、原文摘录、更新/发布时间依据、预发布和安全更新标记。
- 收藏快照、已读记录、收藏 JSON 导出、全局搜索、深浅主题和手机布局。
- `site/feed.xml` 提供 RSS 订阅；`site/sources.opml` 导出 RSS 来源。

## 来源与覆盖

首批扩充至 **91 个订阅入口**，其中 **11 个中文来源**。入口数量与独立发布方数量不同；每次构建会重新计算实际状态。

- 国内：DeepSeek 官方更新、量子位、雷峰网、少数派、36氪、钛媒体、爱范儿、InfoQ 中文、Solidot、人人都是产品经理、PANews。
- AI 与研究：OpenAI、Anthropic、Google、Microsoft Research、Apple ML、Ai2、Berkeley、MIT、arXiv 等。
- 工具：Ollama、vLLM、llama.cpp、LangChain、LlamaIndex、Transformers、Diffusers、MLX、Dify、n8n、ComfyUI 等官方版本订阅。
- 美股独立频道：Yahoo Finance 指数新闻、CNBC 财报、WSJ Markets、AMD 与 Intel 投资者公告，以及既有来源中的美股相关报道和美国政策监管。详见 [来源与归类规则](docs/us-stocks.md)。
- 市场与 Web3：美联储、美国 SEC、欧洲央行、日本央行、英格兰银行、CNBC、FT、MarketWatch、CoinDesk、Ethereum、Vitalik、a16z crypto 等。

信息源配置在 `sources.json`。`rss` 适配器支持 RSS/Atom/RDF；Anthropic 从新闻列表发现文章并读取 `NewsArticle.datePublished`，DeepSeek 从中文官方更新页的明确日期 H2 拆分条目。不会拿 sitemap 修改日期当作发布时间。

X 官方 API 适配器已准备，需要配置凭证、关注账号及预算，默认关闭；微信公众号、Telegram、登录或付费墙后的内容未接入。Qwen 当前博客未找到可读取的稳定日期接口，旧博客和空发布订阅未计入有效来源。Hugging Face 包含社区作者内容，标为社区来源。

## 编排与数据边界

中文摘要 **不需要模型 API Key**：`scripts/summarize.py` 在 GitHub 公开标准 runner 上通过 llama.cpp 运行 Apache 2.0 Qwen3-4B-Instruct-2507（Unsloth Q4_K_M 量化），只向本机回环服务发送公开标题和来源短摘录，生成中文标题及短摘要。模型只翻译标题及摘录中的完整句子；残句弃用并退回标题转述。模型未读取全文，结果可能有误，不提供投资建议或重要性判断。原始文本始终保留，页面标识 AI 摘要及生成依据。

首次最多处理 24 条，之后每次最多 64 条、推理约 9 分钟，优先近期并兼顾不同发布方；未覆盖及失败内容保留原文。摘要按输入指纹缓存，来源修改时失效重做。模型失败不影响原文采集和已有摘要。页面显示近期覆盖数；不承诺全部历史即时翻译。

模型权重约 2.50GB，仅在 runner 的 Actions Cache 中保存，Git 与 Pages 不包含权重。下载内容固定版本及 SHA256 校验：

- [Qwen 官方上游模型](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)，使用 [Unsloth 量化发布](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/a06e946bb6b655725eafa393f4a9745d460374c9)：`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`，SHA256 `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597`。
- [llama.cpp 官方运行器 b11788](https://github.com/ggml-org/llama.cpp/releases/tag/b11788)：Linux x64 CPU 二进制，SHA256 `1a1aea87636985bd078e1f6040b03cfee7f985abc580c39a42324fb0137ddc2a`。

公开仓库标准 GitHub-hosted runner 目前免费，GitHub 定时调度和免费政策仍由平台决定。无需 Codex 定时任务，不消耗此对话的模型额度。若以后迁移私有仓库或其他 runner，先核对 Actions 计费。

首页、最新资讯及频道日报按来源时间倒序，均显示北京时间时分；仅有日期时单独说明。“多源编排”先限制同一来源数量、排除预发布及明显促销标题，再按时间倒序展示；不代表人工精选。分类与话题使用中英文关键词规则，可能有误。

同一 URL 去重，arXiv 同论文不同分类/版本合并；同标题且相近时间的不同发布方可归并显示。未做跨语言语义事件去重，不把多个 arXiv 分类当成多个独立发布方。

保留最近 90 天已经采集的记录。首次接入的历史深度由来源 feed 提供，无法保证每一天或每个来源完整。首页/近期索引按频道、来源和发布方限量，完整内容写入 `site/data/archive/YYYY-MM-DD.json`，访问历史日期时按需加载。

收藏、已读、隐藏来源和主题保存在当前浏览器，不跨设备同步，清除网站数据会删除。已收藏文章保存快照，超出公共归档期仍可在该浏览器查看和导出。

## 更新与部署

`.github/workflows/daily.yml` 计划每两小时在第 17 分钟采集、补充中文摘要，提交生成的数据并部署到 GitHub Pages。手动触发也会补充摘要；仅页面或关注名单变更的 push 复用已有摘要，避免阻塞发布；采集或摘要脚本、来源配置变更的 push 会重新运行摘要。GitHub 调度可能延迟，公开仓库长期无活动时可能暂停；请查看 Actions 实际结果。

单源失败保留历史并展示失败状态；正常但没有近 90 天有效内容显示“暂无近期内容”；全部来源失败时中止当次发布。仅 `site/` 目录发布到 Pages。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/collect.py
node --check site/app.js
python3 -m http.server 8765 --directory site --bind 127.0.0.1
```

采集和测试需要 Python 3.9+、curl，无 pip 依赖。摘要任务需要 Python 3.12+ 和 Linux x64 runner；下载并缓存上述模型及运行器。GitHub 自动提交和 Pages 发布使用平台提供的短期 `GITHUB_TOKEN`，无需配置个人 token。X API Bearer Token 与此不同，仅启用 X 时需要。参考 [GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
