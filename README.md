# Quantumult X Scripts

## Holivator 自动签到

任务画廊地址：

```text
https://raw.githubusercontent.com/ismepy/quanx-scripts/main/gallery.json
```

仅限 iPhone 点击：

[添加到 Quantumult X Task Gallery](https://quantumult.app/x/open-app/ui?module=gallery&type=task&action=add&content=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fismepy%2Fquanx-scripts%2Fmain%2Fgallery.json%22%5D)

如果链接只打开网页而没有唤起 Quantumult X，表示当前设备的 Universal
Link 没有激活。请在 Quantumult X 的 Task Gallery 中手动添加上面的
“任务画廊地址”。

### 安装

1. 在 iPhone 上点击上面的添加链接；如果没有唤起 Quantumult X，则进入
   `构造请求 → Task Gallery → 添加画廊`，粘贴任务画廊地址。
2. 在画廊中安装“Holivator 每日签到”。任务会通过 `addons` 自动添加配套重写资源。
3. 确认 Quantumult X 已安装并信任 MitM 证书，同时启用“重写”和 MitM。
4. 使用 Safari 登录 `https://holivator.de/`。
5. 打开 `https://holivator.de/portal/checkin`，直到收到“登录状态已保存到本机”通知。
6. 模块每天北京时间 09:03:13 执行一次。

Cookie、Bearer Token 和 CSRF Token 只保存在 Quantumult X 的本机
`$prefs` 中，不会写入本仓库。

遇到登录过期时，在 Safari 中重新登录并再次打开签到页面即可更新。
遇到网站风控、挑战、策略阻止或限流时，脚本只通知并停止，不会重试或绕过。

重写资源采用 Quantumult X 官方远程重写格式，仅包含 `hostname` 与重写规则；
定时任务通过 Task Gallery 的 `config` 和 `addons` 字段安装。
