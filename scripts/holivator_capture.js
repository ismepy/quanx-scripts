/*
 * Holivator authentication capture for Quantumult X.
 * Sensitive values stay in Quantumult X preferences on this device.
 */

const STORAGE_KEY = "holivator_auth_v1";
const CREDENTIALS_KEY = "holivator_credentials_v1";
const PENDING_CREDENTIALS_KEY = "holivator_credentials_pending_v1";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const STATUS_URL = "https://holivator.de/api/v1/user/checkin/status";

function log(message) {
  if (typeof console !== "undefined" && console.log) {
    console.log("[Holivator Capture] " + message);
  }
}

function getHeader(headers, name) {
  const wanted = name.toLowerCase();
  const key = Object.keys(headers || {}).find(
    (item) => item.toLowerCase() === wanted
  );
  return key ? headers[key] : "";
}

function getCookie(cookie, name) {
  const prefix = name + "=";
  const part = String(cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!part) return "";
  const value = part.slice(prefix.length);
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_) {
    return {};
  }
}

function notifyAuthSaved() {
  $notify(
    "Holivator 自动签到",
    "登录状态已保存到本机",
    "未上传账号、Cookie 或 Token"
  );
}

log("重写规则已命中");

try {
  const headers = $request.headers || {};
  const oldRaw = $prefs.valueForKey(STORAGE_KEY);
  const oldData = oldRaw ? parseJson(oldRaw) : {};
  const cookie = getHeader(headers, "Cookie") || oldData.cookie || "";
  const authorization =
    getHeader(headers, "Authorization") || oldData.authorization || "";
  const csrf =
    getHeader(headers, "X-CSRF-Token") ||
    getCookie(cookie, "csrf_token") ||
    oldData.csrf ||
    "";

  log(
    "检测登录状态：Cookie=" +
      Boolean(cookie) +
      "，Authorization=" +
      Boolean(authorization) +
      "，CSRF=" +
      Boolean(csrf)
  );

  const nextData = {
    authorization,
    cookie,
    csrf,
    refreshToken: oldData.refreshToken || "",
    capturedAt: new Date().toISOString()
  };

  if (authorization || cookie) {
    const changed =
      authorization !== (oldData.authorization || "") ||
      cookie !== (oldData.cookie || "") ||
      csrf !== (oldData.csrf || "");

    const saved = $prefs.setValueForKey(
      JSON.stringify(nextData),
      STORAGE_KEY
    );
    log("本机保存结果：" + Boolean(saved) + "，状态变化：" + changed);

    const pendingRaw = $prefs.valueForKey(PENDING_CREDENTIALS_KEY);
    const pending = pendingRaw ? parseJson(pendingRaw) : {};
    const pendingAt = Date.parse(pending.capturedAt || "");
    const pendingIsFresh =
      Number.isFinite(pendingAt) &&
      Date.now() - pendingAt >= 0 &&
      Date.now() - pendingAt <= PENDING_MAX_AGE_MS;

    if (
      authorization &&
      pendingIsFresh &&
      pending.username &&
      pending.password
    ) {
      const validationHeaders = { Accept: "application/json" };
      if (authorization) {
        validationHeaders.Authorization = authorization;
      }
      if (cookie) validationHeaders.Cookie = cookie;
      if (csrf) validationHeaders["X-CSRF-Token"] = csrf;

      log("正在向 Holivator 验证登录成功状态");
      $task
        .fetch({
          url: STATUS_URL,
          method: "GET",
          headers: validationHeaders,
          opts: {
            redirection: false,
            "skip-cert-verify": false,
            "auto-cookie": false
          }
        })
        .then((response) => {
          const statusCode = Number(response.statusCode);
          const data = parseJson(response.body);
          const authenticated = statusCode === 200 && data.code === 0;
          log(
            "登录确认接口 HTTP " +
              statusCode +
              "，认证成功=" +
              authenticated
          );

          if (authenticated) {
            const credentialsPromoted = $prefs.setValueForKey(
              JSON.stringify({
                username: pending.username,
                password: pending.password,
                savedAt: new Date().toISOString()
              }),
              CREDENTIALS_KEY
            );
            if (credentialsPromoted) {
              $prefs.removeValueForKey(PENDING_CREDENTIALS_KEY);
              $notify(
                "Holivator 自动签到",
                "完全自动登录已启用",
                "账号密码仅保存在 QuanX 本机"
              );
            }
            log(
              "自动登录凭据确认结果：" +
                Boolean(credentialsPromoted) +
                "，Username=true，Password=true"
            );
          } else if (!oldRaw || changed) {
            notifyAuthSaved();
          }
        })
        .catch(() => {
          log("登录状态验证请求失败，未启用自动重新登录");
          if (!oldRaw || changed) notifyAuthSaved();
        })
        .then(
          () => $done({}),
          () => $done({})
        );
    } else if (pendingRaw && !pendingIsFresh) {
      $prefs.removeValueForKey(PENDING_CREDENTIALS_KEY);
      log("已删除超过 15 分钟且未确认的待确认凭据");
      if (!oldRaw || changed) notifyAuthSaved();
      $done({});
    } else {
      if (!oldRaw || changed) notifyAuthSaved();
      $done({});
    }
  } else {
    log("请求头中没有发现 Cookie 或 Authorization");
    $done({});
  }
} catch (error) {
  log("保存登录状态失败");
  $notify(
    "Holivator 自动签到",
    "保存登录状态失败",
    "请检查 QuanX 日志"
  );
  $done({});
}
