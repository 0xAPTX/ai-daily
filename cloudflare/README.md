# newsHub 自定义域名入口

`news-hub.mjs` 以 `_worker.js` 文件名部署到 Cloudflare Pages 项目
`aptx-news-hub`（Advanced mode），自定义域名 `www.aptx.dev`。
DNS 的 `www` 记录需指向 `aptx-news-hub.pages.dev` 并保持 Proxied。
原先 `newsHub → 知新资讯` 的 Redirect Rule 必须关闭。

Worker 仅转发 `/newsHub` 和 `/newsHub/` 下的 GET/HEAD 请求，固定读取
`https://0xaptx.github.io/ai-daily/`，不转发浏览者的 Cookie 或凭证。
页面补上 `/newsHub/` 资源基址，首次访问默认打开 `#/news`；站内导航、
历史日期、X 数据、RSS、OPML 都由相同入口读取。原始 GitHub 地址不受影响。

资讯仍由原有 GitHub Actions 每小时采集和发布，Worker 无需每天重新部署。
Cloudflare 边缘缓存最多 60 秒，浏览器每次重新验证。此入口使用 Workers Free，
不启用付费订阅；超出免费请求额度时入口可能暂时不可用，GitHub 入口仍可使用。

更新转发代码时，把此文件改名为 `_worker.js` 放进上传 ZIP 的根目录，
并包含一个占位 `index.html`。在 Cloudflare 的 Workers & Pages 中选择
Pages 项目 `aptx-news-hub`，用 Create a new deployment 上传 ZIP 后部署。
官方 Direct Upload 支持 `_worker.js`，无需 GitHub 授权或 API 密钥。
不要启用原来的跳转规则。没有项目路径的请求返回 404，预留以后其他软件入口。

可用 `python3 cloudflare/build_upload.py /tmp/aptx-news-hub.zip` 生成上传包。
