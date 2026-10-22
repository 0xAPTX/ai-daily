# 自定义域名首页与资讯入口

`news-hub.mjs` 以 `_worker.js` 文件名部署到 Cloudflare Pages 项目
`aptx-news-hub`（Advanced mode）。`aptx.dev` 与 `www.aptx.dev` 绑定为
该项目的自定义域名，DNS 的 `@` 和 `www` 记录均指向
`aptx-news-hub.pages.dev`，保持 Proxied。原先的 `newsHub → 知新资讯`
Redirect Rule 必须关闭。

- `https://aptx.dev/` 展示知新首页，首页地址不附加 `#/`。
- `https://www.aptx.dev/` 通过 302 跳转到 `https://aptx.dev/`，保留路径和查询参数；浏览器会保留链接中的频道或文章片段。
- 旧的 `https://aptx.dev/#/` 首页链接仍可用，打开或点击首页后会自动收起该片段；频道筛选及深链接不受影响。
- `/newsHub` 与 `/newsHub/` 保留资讯入口，默认打开 `#/news`。
- 两种路径下的频道、日报、文章、历史数据、RSS 与 OPML 都从对应基址加载。
- 原始 GitHub Pages 地址继续可用。

Function 仅接受 GET/HEAD，固定读取 `https://0xaptx.github.io/ai-daily/`，
不转发浏览者的 Cookie 或凭证；不会成为任意地址的开放代理。
根路径补上 `/` 资源基址，资讯入口补上 `/newsHub/`。

资讯由原有 GitHub Actions 每小时采集和发布，Function 无需随内容重复部署。
Cloudflare 边缘缓存设为 60 秒，浏览器每次重新验证。使用免费方案，不启用
付费订阅；超过免费请求额度时自定义入口可能暂时不可用，GitHub 入口仍可使用。

运行 `node --test cloudflare/test_proxy.mjs` 检查两种路径的路由、资源和凭证隔离。
用 `python3 cloudflare/build_upload.py /tmp/aptx-news-hub.zip` 生成上传包。
在 Cloudflare Workers & Pages 选择 Pages 项目 `aptx-news-hub`，
用 Create a new deployment 上传 ZIP 后发布 Production。
官方 Direct Upload 支持 `_worker.js`，无需新增 GitHub 授权或 API 密钥。
