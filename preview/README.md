# 本机预览数据

`snapshot.json` 来自公开接口 `https://dealhunter.gongjiang667.workers.dev/api/board` 和 `/api/runs`，抓取时间为文件中的 `generatedAt`。这是一份固定快照，不会自行刷新，也不包含密钥。

预览使用真实公开记录，不补造优惠条件。快照没有译文时会显示原文。浏览器验收中的翻译样例单独生成，仅用于测试，不混入此快照。

在源码目录运行 `npm run preview`，打开 `http://127.0.0.1:43118/`。该预览不会调用线上采集、翻译或其他管理接口。
