# 迅雷看看字幕 — Stremio 插件

这是把原来的 Forward「迅雷看看 字幕」模块转换成 Stremio Subtitle Addon。

## 功能
- 使用迅雷看看 `api-shoulei-ssl.xunlei.com/oracle/subtitle`
- Stremio 电影 / 电视剧字幕接口
- 自动通过 Cinemeta 把 IMDb `tt...` ID 转换成片名
- 保留原脚本的番号识别、搜索关键词、结果评分、去重、简中标记
- 最多返回 10 条字幕

## 部署
要求 Node.js 18+。

```bash
npm install
npm start
```

默认端口：7000。

然后把：
`http://你的服务器IP:7000/manifest.json`

添加到 Stremio。

如果部署在公网，建议使用 HTTPS，例如：
`https://你的域名/manifest.json`

## 注意
原 Forward 模块本身是按片名调用迅雷接口的，并不是 Stremio 原生接口。
本项目用 Cinemeta 将 Stremio 的 IMDb ID 解析成标题，再调用迅雷接口，因此需要服务器能够访问：
- v3-cinemeta.strem.io
- api-shoulei-ssl.xunlei.com
