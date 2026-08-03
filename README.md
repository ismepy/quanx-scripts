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
2. 如果安装过旧版本，先删除旧的 Holivator 定时任务和重写资源，再从画廊重新安装。
   先点“添加”安装八个 Task（七条星期签到任务和一条清除任务），
   再在同一画廊项目中点“添加附加组件”安装重写资源。
   QuanX 会分别确认任务和附加组件，不会在只添加任务时静默安装重写资源。
3. 确认 Quantumult X 已安装并信任 MitM 证书，同时启用“重写”和 MitM。
4. 使用 Safari 或 Chrome 打开 `https://holivator.de/`，用账号密码登录。
5. 登录成功后的 15 分钟内打开 `https://holivator.de/portal/checkin`，直到收到
   “完全自动登录已启用”通知。
6. 模块每周一至周日分别在北京时间 09:26:53、09:05:17、09:48:37、09:42:15、09:11:42、09:34:29、09:18:06 执行，每天一次。
7. 网站接口返回相应数据时，任务通知会依次显示今日积分、媒体账号过期时间、
   用户信息中的当前积分和连续签到天数。过期时间按北京时间显示。
   成功、已签到、限流、风控、失败和媒体账号状态会使用对应的表情符号区分。

账号密码、Cookie、Bearer Token、刷新令牌和 CSRF Token 只保存在
Quantumult X 的本机 `$prefs` 中，不会写入本仓库或通知、日志。

短期登录令牌过期时，脚本会使用刷新令牌自动续期。
核心请求遇到网络错误或临时服务器错误时会安全重试一次；续期请求连续发生
网络错误且本机存在已确认凭据时，脚本会使用本机账号密码自动重新登录。
刷新令牌明确失效时也会自动重新登录并取得新令牌。续期接口返回 403、429、
5xx 或其他异常 HTTP 响应时不会继续发送登录密码，也不会无限重试。
签到提交的响应丢失或返回 5xx 时，脚本会反查今日签到状态，避免把已经成功的
签到误报为失败。登录凭据只有在登录后出现新令牌且用户信息中的用户名匹配时
才会被确认，旧会话不会覆盖已经保存的正确密码。
密码变化、两步验证、验证码、账号异常或网站接口变化仍可能需要手动处理。

如需停止使用，在 Quantumult X 中手动运行“Holivator 清除本机登录信息”，
它会删除账号密码、Cookie 和全部令牌。

`$prefs` 位于 Quantumult X 应用数据中，但不是 iOS 系统钥匙串。
不要安装来源不明的脚本，也不要把 Quantumult X 数据或未解锁设备交给他人。
本功能不需要开启 HTTP 抓取/HTTP Analyzer；如果曾经开启，请在首次保存完成后
关闭并清除抓取记录，因为抓取工具本身可能记录登录请求正文。
不要公开分享 Quantumult X 配置、数据导出或包含其应用数据的未加密备份。
遇到网站风控、挑战、策略阻止或限流时，脚本只通知并停止，不会重试或绕过。

重写资源采用 Quantumult X 官方远程重写格式，仅包含 `hostname` 与重写规则；
定时任务通过 Task Gallery 的 `config` 和 `addons` 字段安装。
实际执行脚本固定到不可变的 Git 提交版本，避免 `main` 分支后续变化直接读取本机凭据；
以后升级功能时需要从画廊重新安装新版本。

维护者可使用 Node.js 运行完整回归测试：

```text
node tests/holivator_regression.test.js
```
