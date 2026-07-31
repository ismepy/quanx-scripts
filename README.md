# Quantumult X Scripts

## Holivator 自动签到

任务画廊地址：

```text
https://raw.githubusercontent.com/ismepy/quanx-scripts/main/gallery.json
```

Quantumult X 直接 Scheme（复制到 iPhone 浏览器地址栏打开）：

```text
quantumult-x:///ui?module=gallery&type=task&action=add&content=%5B%22https%3A%2F%2Fraw.githubusercontent.com%2Fismepy%2Fquanx-scripts%2Fmain%2Fgallery.json%22%5D
```

### 安装

1. 复制上面的直接 Scheme，在 iPhone 浏览器地址栏粘贴并打开。
   如果浏览器仍未唤起 Quantumult X，则进入
   `构造请求 → Task Gallery → 添加画廊`，粘贴任务画廊地址。
2. 在画廊中安装“Holivator 每日签到”。任务会通过 `addons` 自动添加配套重写资源。
3. 确认 Quantumult X 已安装并信任 MitM 证书，同时启用“重写”和 MitM。
4. 使用 Safari 或 Chrome 登录 `https://holivator.de/`。账号密码登录或网页上的
   Telegram 登录都可以。
5. 登录成功后，确认收到“登录令牌已保存，自动续期已启用”通知；再打开
   `https://holivator.de/portal/checkin`。
6. 模块每天北京时间 09:03:13 执行一次。

Cookie、Bearer Token、刷新令牌和 CSRF Token 只保存在 Quantumult X 的本机
`$prefs` 中，不会写入本仓库。

短期登录令牌过期时，脚本会使用刷新令牌自动续期并重试一次。
只有刷新令牌也失效时，才会通知重新登录。脚本不会保存账号密码或 Telegram 会话。
遇到网站风控、挑战、策略阻止或限流时，脚本只通知并停止，不会重试或绕过。

重写资源采用 Quantumult X 官方远程重写格式，仅包含 `hostname` 与重写规则；
定时任务通过 Task Gallery 的 `config` 和 `addons` 字段安装。
