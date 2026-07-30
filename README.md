# Quantumult X Scripts

## Holivator 自动签到

任务画廊地址：

```text
https://raw.githubusercontent.com/ismepy/quanx-scripts/main/gallery.json
```

一键添加 Task Gallery：

```text
https://quantumult.app/x/open-app/ui?module=gallery&type=task&action=add&content=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fismepy%2Fquanx-scripts%2Fmain%2Fgallery.json%22%5D
```

### 安装

1. 在 iPhone 的 Safari 中打开上面的一键链接，使用 Quantumult X 官方 URL Scheme 添加 Task Gallery。
2. 在画廊中安装全部 7 条“Holivator 周几 HH:MM”任务。任务会通过 `addons` 添加配套重写资源。
3. 确认 Quantumult X 已安装并信任 MitM 证书，同时启用“重写”和 MitM。
4. 使用 Safari 登录 `https://holivator.de/`。
5. 打开 `https://holivator.de/portal/checkin`，直到收到“登录状态已保存到本机”通知。
6. 模块按北京时间每周错峰执行，均在第 13 秒触发：
   - 周一 09:03
   - 周二 09:12
   - 周三 09:17
   - 周四 09:34
   - 周五 09:22
   - 周六 09:06
   - 周日 09:19

从旧版“Holivator 每日签到”更新时，请先删除旧任务，再安装并启用上述
7 条任务，避免周一重复执行。

Cookie、Bearer Token 和 CSRF Token 只保存在 Quantumult X 的本机
`$prefs` 中，不会写入本仓库。

遇到登录过期时，在 Safari 中重新登录并再次打开签到页面即可更新。
遇到网站风控、挑战、策略阻止或限流时，脚本只通知并停止，不会重试或绕过。

重写资源采用 Quantumult X 官方远程重写格式，仅包含 `hostname` 与重写规则；
定时任务通过 Task Gallery 的 `config` 和 `addons` 字段安装。
