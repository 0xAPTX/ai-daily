# 知新 · AI 每日阅读

一个从零开始的 GitHub Pages 资讯站，主题来自「汇总AI一手资讯」对话。

## 第一版能做什么

- 模型与技术、产品与应用、行业与商业三个分类。
- 简报从近 7 天内容按发布时间选取，每类最多 3 条；没有更新时不凑数。
- 全部资讯、日期筛选、搜索、收藏、已读记录；适配手机。
- 6 个发布方 RSS（Hugging Face 包含社区文章）；按规范链接与同源标题去重，保留最近 90 天历史。
- 收藏包含文章快照，保存在当前浏览器 localStorage，不跨设备同步；清除网站数据会删除收藏。
- 计划每天北京时间 08:17、18:17 采集并发布。GitHub 的计划任务可能延迟，公开仓库长期无活动时可能暂停，查看 Actions 确认。
- 显示各来源采集状态与时间。单源失败保留历史；全部失败使 workflow 失败，不发布为成功更新。

## 明确的边界

这一版展示**原文标题和发布方摘录**，没有调用模型生成中文摘要。中文解释、重要性判断、事件级跨源去重、每周回顾都尚未接入。关键词分类可能有误，官方观点不等同于独立验证。

NVIDIA 新闻室包含 AI 之外的公司新闻；当前对其内容不做模型相关性筛选。

## 本地运行

需要 Python 3.9+ 与 curl，无需安装第三方包。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/collect.py
python3 -m http.server 8765 --directory site --bind 127.0.0.1
```

浏览 `http://127.0.0.1:8765`。如果采集被网络阻止，已有 `site/data/feed.json` 仍可用于预览。

## 部署到 GitHub Pages

1. 把整个项目放进自己的仓库（主分支 `main`）。
2. Settings → Pages → Source 选择 GitHub Actions。
3. 在 Actions 中手动运行 `Update AI Daily`；之后提交代码或计划任务会更新。
4. 到 Pages 取得网站地址。可使用普通仓库路径，无需占用用户名主页。

发布遵循 [GitHub Pages 官方工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。只将 `site/` 上传为公开站点内容。配置资讯源修改 `sources.json`，不要把密钥放在网页或仓库里。
