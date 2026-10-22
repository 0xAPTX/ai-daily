# 知新 · 多源资讯站

在 GitHub Pages 上运行的个人阅读站，组织方式参考 [wqu.guru](https://wqu.guru/)，直接采集各发布方公开来源。网站地址：[打开知新](https://0xaptx.github.io/ai-daily/)

自定义域名入口：[www.aptx.dev/newsHub/](https://www.aptx.dev/newsHub/)。浏览站内频道时保留自定义域名，原 GitHub Pages 地址继续可用。该入口通过 Cloudflare Pages Function 读取已发布的 GitHub Pages 内容，仍由原有 GitHub Actions 更新资讯；部署说明见 [cloudflare/README.md](cloudflare/README.md)。如果此前访问过旧的 301 跳转，可先使用此处末尾带 `/` 的入口避开浏览器旧缓存。

快捷入口：[美股](https://0xaptx.github.io/ai-daily/#/news?topic=stocks) · [港股](https://0xaptx.github.io/ai-daily/#/news?topic=hk) · [X 关注名单](https://0xaptx.github.io/ai-daily/#/x) · [全部信源](https://0xaptx.github.io/ai-daily/#/sources)

## 当前功能

- 首页直接展示各频道内容模块；资讯页默认模块总览，也可切换北京时间倒序时间线。八个频道：AI、投资市场、美股资讯、港股资讯、产品商业、开发工具、学术研究、加密 Web3。
- 资讯流按发布时间排序，可筛中文、来源类型、关键词、主题和日期。
- 每日日报按真实发布时间倒序，每个频道最多六条；来源仅提供日期时不补造时分。
- 中文标题和摘要：GitHub runner 内运行开源 Qwen 模型，增量生成，保留原文与覆盖进度。
- X 关注名单：首次从 @0xAPTX 导入 27 个已关注账号，保留 6 个补充候选；最新数量以页面为准。全部名单与热帖资格分开，来源与导入时间可核对。
- 每半天 X 关注同步流程：GitHub Actions 北京时间 07:43、19:43 检查，完整分页后更新名单；目前按用户选择保持未启用，缺少凭证或预算为 0 不会请求接口。
- X 热帖监测页及官方 API 接入程序：低于 10 万粉丝的指定账号、互动门槛、采样时间和原帖时间线。默认未启用，见 [接入说明](docs/x-setup.md)。
- 站内热点按过去 24 小时标题关键词计数；不代表全网热度。
- 信源目录显示配置数、读取结果、最近活跃、语言和类型，可在当前浏览器隐藏来源。
- 来源详情和原文链接、原文摘录、更新/发布时间依据、预发布和安全更新标记。
- 收藏快照、已读记录、收藏 JSON 导出、全局搜索、深浅主题和手机布局。
- `site/feed.xml` 提供 RSS 订阅；`site/sources.opml` 导出 RSS 来源。

## 来源与覆盖

首批扩充至 **95 个订阅入口**，其中 **15 个中文入口**。入口数量与独立发布方数量不同；每次构建会重新计算实际状态。

- 国内：DeepSeek 官方更新、量子位、雷峰网、少数派、36氪、钛媒体、爱范儿、InfoQ 中文、Solidot、人人都是产品经理、PANews。
- AI 与研究：OpenAI、Anthropic、Google、Microsoft Research、Apple ML、Ai2、Berkeley、MIT、arXiv 等。
- 工具：Ollama、vLLM、llama.cpp、LangChain、LlamaIndex、Transformers、Diffusers、MLX、Dify、n8n、ComfyUI 等官方版本订阅。
- 美股独立频道：Yahoo Finance 指数新闻、CNBC 财报、WSJ Markets、AMD 与 Intel 投资者公告，以及既有来源中的美股相关报道和美国政策监管。详见 [来源与归类规则](docs/us-stocks.md)。
- 港股独立频道：港交所新闻稿、证券市场通告、香港电台财经、Yahoo 恒指新闻，保留繁体中文。港交所入口不等于全部上市公司披露易公告，详见 [来源与归类规则](docs/hk-stocks.md)。
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

## 日常怎么用

1. 首页按频道同时展示内容模块；进入港股、美股等频道可看最新动态、市场、公司与公告等分区，或切换完整时间线。首页或资讯页选择频道；“美股”“港股”在顶部有独立入口。
2. 默认按发布时间由新到旧，时间统一为北京时间；可搜索关键词、切换来源类型，或选择日期看完整归档。
3. 勾选“中文可读”只显示中文原文及已有中文摘要的内容；英文摘要按批次补齐，不是每条即时翻译。
4. 点击“原文”查看完整上下文；收藏、已读和隐藏来源仅存在当前浏览器。X 页面查看完整关注名单及同步状态。

## 自动任务与费用

| 任务 | 计划（北京时间） | 当前状态 | 凭证与费用 |
|---|---|---|---|
| 新闻收集、留档、发布 | 每小时，第 17 分钟 | 已启用 | 公开 RSS，无外部付费接口 |
| 中文标题与摘要 | 定时/手动任务及相关脚本或信源变更时 | 已启用，增量处理 | 公开标准 runner 运行开源模型，无模型 API Key |
| X 关注名单同步 | 每天 07:43、19:43（每 12 小时） | 流程已准备，**未启用** | 需要 `X_BEARER_TOKEN` 和批准预算 |
| X 热帖检测 | 每小时新闻任务中检查 | **未启用** | 需要独立启用开关；与关注同步共用预算 |

GitHub 运行任务与 X 提供数据是两件事。当前 `followingSync.enabled: false`、`enabled: false`、`monthlyBudgetUsd: 0`，不会调用 X 付费接口。以后仅同步关注时，可只启用 `followingSync.enabled`，热帖检测继续关闭；配置步骤与官方价格见 [X 接入说明](docs/x-setup.md)。GitHub 自动运行不需要此聊天保持打开。

## 更新与部署

`.github/workflows/daily.yml` 计划每小时（每小时第 17 分钟）采集、补充中文摘要，提交生成的数据并部署到 GitHub Pages。每天 07:43、19:43 另有关注名单检查任务（目前未启用接口）。手动触发也会补充摘要并检查关注同步；仅页面或关注名单变更的 push 复用已有摘要，避免阻塞发布；采集或摘要脚本、来源配置变更的 push 会重新运行摘要。GitHub 调度可能延迟，公开仓库长期无活动时可能暂停；请查看 Actions 实际结果。

排队的任务启动时读取最新 `main`。保存历史前后核对远端版本；遇到并发提交时跳过旧结果及部署，由后续任务重新采集，避免推送冲突或覆盖新代码。真实的网络、权限错误仍会报错。

单源失败保留历史并展示失败状态；正常但没有近 90 天有效内容显示“暂无近期内容”；全部来源失败时中止当次发布。仅 `site/` 目录发布到 Pages。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/collect.py
node --check site/app.js
python3 -m http.server 8765 --directory site --bind 127.0.0.1
```

主要文件：`sources.json` 管理新闻来源；`x-watchlist.json` 管理关注名单、两个启用开关和共用预算；`scripts/collect.py` 收集新闻；`scripts/sync_x_following.py` 同步关注；`scripts/collect_x.py` 检测热帖；`site/data/` 存放公开生成数据。

采集和测试需要 Python 3.9+、curl，无 pip 依赖。摘要任务需要 Python 3.12+ 和 Linux x64 runner；下载并缓存上述模型及运行器。GitHub 自动提交和 Pages 发布使用平台提供的短期 `GITHUB_TOKEN`，无需配置个人 token。X API Bearer Token 与此不同，仅启用 X 时需要。参考 [GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
