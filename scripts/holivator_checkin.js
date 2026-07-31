/*
 * Holivator scheduled check-in for Quantumult X.
 * Authentication is read only from Quantumult X local preferences.
 */

const STORAGE_KEY = "holivator_auth_v1";
const API_BASE = "https://holivator.de/api/v1";
const STATUS_URL = API_BASE + "/user/checkin/status";
const CHECKIN_URL = API_BASE + "/user/checkin";
const REFRESH_URL = API_BASE + "/auth/refresh";

let finished = false;
let refreshAttempted = false;

function log(message) {
  if (typeof console !== "undefined" && console.log) {
    console.log("[Holivator Checkin] " + message);
  }
}

function finish(subtitle, message) {
  if (finished) return;
  finished = true;
  log("任务结束：" + subtitle + (message ? "；" + message : ""));
  $notify("Holivator 自动签到", subtitle, message || "");
  $done();
}

log("任务开始");

const variables =
  typeof $environment !== "undefined" && $environment.variables
    ? $environment.variables
    : {};
const configuredTimeout = Number.parseInt(
  variables["force-timeout"] || "30000",
  10
);
const forceTimeout =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 30000;

setTimeout(() => {
  finish("执行超时", "任务未在限定时间内完成");
}, forceTimeout);

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_) {
    return {};
  }
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

function normalizeAuthorization(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return /^Bearer\s+/i.test(value) ? value : "Bearer " + value;
}

function errorInfo(data) {
  const detail =
    data && typeof data.detail === "object" ? data.detail : {};
  return {
    code: String(detail.code || data.code || ""),
    reason: String(detail.reason_code || ""),
    message: String(detail.message || data.message || "未知错误")
  };
}

function isBlocked(code) {
  return [
    "CHECKIN_RISK_BLOCKED",
    "RISK_BLOCKED",
    "CHALLENGE_REQUIRED",
    "POLICY_BLOCKED"
  ].includes(code);
}

let auth;
try {
  auth = JSON.parse($prefs.valueForKey(STORAGE_KEY) || "{}");
} catch (_) {
  auth = {};
}

log(
  "读取登录状态：Cookie=" +
    Boolean(auth.cookie) +
    "，Authorization=" +
    Boolean(auth.authorization) +
    "，CSRF=" +
    Boolean(auth.csrf) +
    "，Refresh Token=" +
    Boolean(auth.refreshToken)
);

if (!auth.authorization && !auth.cookie) {
  finish(
    "尚未获取登录状态",
    "请启用模块后用 Safari 登录，并打开 Holivator 签到页面"
  );
} else {
  const requestOptions = {
    redirection: true,
    "skip-cert-verify": false,
    "auto-cookie": false
  };

  function buildHeaders() {
    const csrf = auth.csrf || getCookie(auth.cookie, "csrf_token");
    const headers = {
      Accept: "application/json",
      Origin: "https://holivator.de",
      Referer: "https://holivator.de/portal/checkin",
      "User-Agent": "Quantumult X Holivator Checkin/1.1"
    };

    if (auth.authorization) headers.Authorization = auth.authorization;
    if (auth.cookie) headers.Cookie = auth.cookie;
    if (csrf) headers["X-CSRF-Token"] = csrf;
    return headers;
  }

  function refreshAccessToken() {
    if (!auth.refreshToken) {
      finish(
        "登录状态已过期",
        "尚未保存刷新令牌；请更新重写资源后重新登录一次"
      );
      return Promise.resolve(false);
    }

    log("Access Token 已过期，正在自动续期");
    return $task
      .fetch({
        url: REFRESH_URL,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://holivator.de",
          Referer: "https://holivator.de/"
        },
        body: JSON.stringify({ refresh_token: auth.refreshToken }),
        opts: requestOptions
      })
      .then((response) => {
        const statusCode = Number(response.statusCode);
        const data = parseJson(response.body);
        const tokenData =
          data && typeof data.data === "object" ? data.data : data;
        const accessToken =
          tokenData.access_token || tokenData.accessToken || "";

        log("续期接口 HTTP " + statusCode);

        if (statusCode === 429) {
          finish("请求过于频繁", "自动续期已停止，不会继续重试");
          return false;
        }

        if (statusCode >= 200 && statusCode < 300 && accessToken) {
          auth.authorization = normalizeAuthorization(accessToken);
          auth.refreshToken =
            tokenData.refresh_token ||
            tokenData.refreshToken ||
            auth.refreshToken;
          auth.capturedAt = new Date().toISOString();

          const saved = $prefs.setValueForKey(
            JSON.stringify(auth),
            STORAGE_KEY
          );
          log("自动续期成功，本机保存结果：" + Boolean(saved));
          return true;
        }

        finish(
          "登录状态已过期",
          "刷新令牌也已失效，请重新登录 Holivator"
        );
        return false;
      });
  }

  function authenticatedRequest(url, method) {
    const send = () =>
      $task.fetch({
        url,
        method,
        headers: buildHeaders(),
        opts: requestOptions
      });

    return send().then((response) => {
      if (Number(response.statusCode) !== 401 || refreshAttempted) {
        return response;
      }

      refreshAttempted = true;
      return refreshAccessToken().then((refreshed) => {
        if (!refreshed || finished) return null;
        log("续期完成，重新发送原请求");
        return send();
      });
    });
  }

  log("正在查询今日签到状态");
  authenticatedRequest(STATUS_URL, "GET")
    .then((statusResponse) => {
      if (!statusResponse || finished) return null;

      const statusCode = Number(statusResponse.statusCode);
      log("状态接口 HTTP " + statusCode);

      if (statusCode === 401) {
        finish(
          "登录状态已过期",
          "自动续期失败，请重新登录 Holivator"
        );
        return null;
      }

      if (statusCode === 429) {
        finish("请求过于频繁", "已停止执行，不会自动重试");
        return null;
      }

      const statusData = parseJson(statusResponse.body);
      if (
        statusData.code === 0 &&
        statusData.data &&
        statusData.data.checked_in_today
      ) {
        finish("今日已经签到", "无需重复签到");
        return null;
      }

      log("今日尚未签到，正在提交签到请求");
      return authenticatedRequest(CHECKIN_URL, "POST");
    })
    .then((response) => {
      if (!response || finished) return;

      const statusCode = Number(response.statusCode);
      log("签到接口 HTTP " + statusCode);

      if (statusCode === 401) {
        finish(
          "登录状态已过期",
          "自动续期失败，请重新登录 Holivator"
        );
        return;
      }

      if (statusCode === 429) {
        finish("请求过于频繁", "已停止执行，不会自动重试");
        return;
      }

      const data = parseJson(response.body);
      if (data.code === 0) {
        const points =
          data.data && data.data.points_awarded !== undefined
            ? "，获得 " + data.data.points_awarded + " 积分"
            : "";
        finish("签到成功", "今日签到完成" + points);
        return;
      }

      const info = errorInfo(data);
      if (isBlocked(info.code)) {
        const reason = info.reason ? " (" + info.reason + ")" : "";
        finish("签到被网站阻止", info.message + reason + "；已停止执行");
        return;
      }

      if (
        /already|checked.?in|已签到/i.test(info.code + " " + info.message)
      ) {
        finish("今日已经签到", info.message);
        return;
      }

      finish("签到失败", info.message);
    })
    .catch((error) => {
      const message =
        error && typeof error === "object" && error.error
          ? error.error
          : String(error);
      finish("网络请求失败", message);
    });
}
