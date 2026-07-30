# Quantumult X Scripts

## Holivator 自动签到

订阅地址：

```text
https://raw.githubusercontent.com/ismepy/quanx-scripts/main/holivator.snippet
```

### 安装

1. 在 Quantumult X 的“重写”资源中添加上面的订阅地址。
2. 确认 Quantumult X 已安装并信任 MitM 证书，同时启用“重写”和 MitM。
3. 使用 Safari 登录 `https://holivator.de/`。
4. 打开 `https://holivator.de/portal/checkin`，直到收到“登录状态已保存到本机”通知。
5. 模块每天在北京时间 08:00–08:55 之间随机选择一个时间点执行。

Quantumult X 每 5 分钟唤醒一次任务，脚本每天随机选择其中一个时间点，
并在本机记录当天已经尝试过，避免重复签到。随机时间粒度为 5 分钟。

Cookie、Bearer Token 和 CSRF Token 只保存在 Quantumult X 的本机
`$prefs` 中，不会写入本仓库。

遇到登录过期时，在 Safari 中重新登录并再次打开签到页面即可更新。
遇到网站风控、挑战、策略阻止或限流时，脚本只通知并停止，不会重试或绕过。
