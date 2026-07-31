/*
 * Holivator scheduled check-in for Quantumult X.
 * Authentication and optional login credentials are read only from
 * Quantumult X local preferences.
 */

const STORAGE_KEY = "holivator_auth_v1";
const CREDENTIALS_KEY = "holivator_credentials_v1";
const API_BASE = "https://holivator.de/api/v1";
const STATUS_URL = API_BASE + "/user/checkin/status";
const CHECKIN_URL = API_BASE + "/user/checkin";
const MEDIA_ACCOUNTS_URL =
  API_BASE + "/user/media-accounts?skip=0&limit=10";
const REFRESH_URL = API_BASE + "/auth/refresh";
const LOGIN_URL = API_BASE + "/auth/login";

let finished = false;
let recoveryAttempted = false;
let recoverySummary = "";

function log(message) {
  if (typeof console !== "undefined" && console.log) {
    console.log("[Holivator Checkin] " + message);
  }
}

function statusIcon(subtitle) {
  const text = String(subtitle || "");
  if (/签到成功/.test(text)) return "✅";
  if (/已经签到/.test(text)) return "📅";
  if (/网站阻止/.test(text)) return "🛑";
  if (/请求过于频繁/.test(text)) return "⚠️";
  if (/登录状态已过期|尚未获取登录状态|需要两步验证/.test(text)) {
    return "🔐";
  }
  if (/执行超时/.test(text)) return "⏱️";
  if (/失败/.test(text)) return "❌";
  if (/暂时/.test(text)) return "⚠️";
  return "ℹ️";
}

function finish(subtitle, message) {
  if (finished) return;
  finished = true;
  log("任务结束：" + subtitle + (message ? "；" + message : ""));
  $notify(
    "Holivator 自动签到",
    statusIcon(subtitle) + " " + subtitle,
    message || ""
  );
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

function firstDisplayValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

function checkinDetails(data, fallbackPoints) {
  const details = data && typeof data === "object" ? data : {};
  const todayPoints = firstDisplayValue([
    details.today_points,
    details.todayPoints,
    fallbackPoints
  ]);
  const streak = firstDisplayValue([
    details.streak,
    details.streak_days,
    details.streakDays
  ]);
  const totalPoints = firstDisplayValue([
    details.total_points_earned,
    details.totalPointsEarned
  ]);
  const lines = [];

  if (todayPoints !== "") lines.push("🎁 今日积分：" + todayPoints);
  if (streak !== "") lines.push("🔥 连续签到：" + streak + " 天");
  if (totalPoints !== "") lines.push("🏆 累计积分：" + totalPoints);

  return lines.join("\n");
}

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function formatMediaExpiry(value) {
  const text = String(value || "").trim();
  if (!text) return "永久";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ? text
    : text + "+08:00";
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return text;

  const beijingTime = new Date(timestamp + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  if (year > 2100) return "永久";

  return (
    year +
    "-" +
    twoDigits(beijingTime.getUTCMonth() + 1) +
    "-" +
    twoDigits(beijingTime.getUTCDate()) +
    " " +
    twoDigits(beijingTime.getUTCHours()) +
    ":" +
    twoDigits(beijingTime.getUTCMinutes())
  );
}

function mediaAccountDetails(data) {
  const details = data && typeof data === "object" ? data : {};
  const items = Array.isArray(details.items)
    ? details.items
    : Array.isArray(details)
      ? details
      : [];

  if (items.length === 0) return "ℹ️ 媒体账号：未找到";

  return items
    .map((item, index) => {
      const number = items.length > 1 ? index + 1 : "";
      const serviceName = firstDisplayValue([
        item && item.service_name,
        item && item.account_type
      ]);
      const service = serviceName ? "（" + serviceName + "）" : "";
      const expiry = formatMediaExpiry(item && item.expires_at);
      const icon = expiry === "永久" ? "♾️" : "⏳";
      return (
        icon +
        " " +
        "媒体账号" +
        number +
        service +
        "过期：" +
        expiry
      );
    })
    .join("\n");
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
  auth = parseJson($prefs.valueForKey(STORAGE_KEY));
} catch (_) {
  auth = {};
}

let credentials;
try {
  credentials = parseJson($prefs.valueForKey(CREDENTIALS_KEY));
} catch (_) {
  credentials = {};
}

log(
  "读取登录状态：Cookie=" +
    Boolean(auth.cookie) +
    "，Authorization=" +
    Boolean(auth.authorization) +
    "，CSRF=" +
    Boolean(auth.csrf) +
    "，Refresh Token=" +
    Boolean(auth.refreshToken) +
    "，自动登录凭据=" +
    Boolean(credentials.username && credentials.password)
);

if (
  !auth.authorization &&
  !auth.cookie &&
  !(credentials.username && credentials.password)
) {
  finish(
    "尚未获取登录状态",
    "请启用模块后用账号密码登录，并打开 Holivator 签到页面"
  );
} else {
  const requestOptions = {
    redirection: false,
    "skip-cert-verify": false,
    "auto-cookie": false
  };
  const authRequestOptions = {
    redirection: false,
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

  function finishWithDetails(
    subtitle,
    statusData,
    fallbackPoints,
    fallbackMessage
  ) {
    const checkinMessage =
      checkinDetails(statusData, fallbackPoints) || fallbackMessage;
    const mediaHeaders = buildHeaders();
    mediaHeaders.Referer = "https://holivator.de/portal/media-accounts";

    log("正在查询媒体账号过期时间");
    return $task
      .fetch({
        url: MEDIA_ACCOUNTS_URL,
        method: "GET",
        headers: mediaHeaders,
        opts: requestOptions
      })
      .then((response) => {
        const statusCode = Number(response.statusCode);
        const data = parseJson(response.body);
        let mediaMessage = "⚠️ 媒体账号过期：暂时无法查询";

        if (statusCode === 200 && data.code === 0 && data.data) {
          mediaMessage = mediaAccountDetails(data.data);
        } else if (statusCode === 403) {
          mediaMessage = "🔐 媒体账号过期：无权查看";
        }

        log("媒体账号接口 HTTP " + statusCode);
        finish(
          subtitle,
          [recoverySummary, checkinMessage, mediaMessage]
            .filter(Boolean)
            .join("\n")
        );
      })
      .catch(() => {
        log("媒体账号过期时间查询失败");
        finish(
          subtitle,
          [
            recoverySummary,
            checkinMessage,
            "⚠️ 媒体账号过期：暂时无法查询"
          ]
            .filter(Boolean)
            .join("\n")
        );
      });
  }

  function saveAuth() {
    auth.capturedAt = new Date().toISOString();
    return $prefs.setValueForKey(JSON.stringify(auth), STORAGE_KEY);
  }

  function refreshAccessToken() {
    if (!auth.refreshToken) {
      log("没有可用的 Refresh Token，准备自动重新登录");
      return Promise.resolve("reauthenticate");
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
        opts: authRequestOptions
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
          return "stop";
        }

        if (statusCode >= 200 && statusCode < 300 && accessToken) {
          auth.authorization = normalizeAuthorization(accessToken);
          auth.refreshToken =
            tokenData.refresh_token ||
            tokenData.refreshToken ||
            auth.refreshToken;

          const saved = saveAuth();
          recoverySummary = "🔄 登录状态：已自动续期";
          log("自动续期成功，本机保存结果：" + Boolean(saved));
          return "success";
        }

        if ([400, 401, 422].includes(statusCode)) {
          log("Refresh Token 已失效，准备自动重新登录");
          return "reauthenticate";
        }

        finish(
          "自动续期暂时失败",
          "网站服务异常；为保护账号，本次未发送登录密码"
        );
        return "stop";
      })
      .catch(() => {
        finish(
          "自动续期网络失败",
          "为保护账号，未输出请求详情，也未继续发送登录密码"
        );
        return "stop";
      });
  }

  function loginWithCredentials() {
    if (!credentials.username || !credentials.password) {
      finish(
        "登录状态已过期",
        "未保存自动登录凭据，请用账号密码重新登录一次"
      );
      return Promise.resolve(false);
    }

    log("正在自动重新登录：Username=true，Password=true");
    return $task
      .fetch({
        url: LOGIN_URL,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://holivator.de",
          Referer: "https://holivator.de/login"
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password
        }),
        opts: authRequestOptions
      })
      .then((response) => {
        const statusCode = Number(response.statusCode);
        const data = parseJson(response.body);
        const tokenData =
          data && typeof data.data === "object" ? data.data : data;
        const accessToken =
          tokenData.access_token || tokenData.accessToken || "";
        const refreshToken =
          tokenData.refresh_token || tokenData.refreshToken || "";

        log("自动登录接口 HTTP " + statusCode);

        if (statusCode === 429) {
          finish("请求过于频繁", "自动重新登录已停止，不会继续重试");
          return false;
        }

        if (statusCode >= 500) {
          finish(
            "自动重新登录暂时失败",
            "网站服务异常，请稍后再试"
          );
          return false;
        }

        if (
          statusCode >= 200 &&
          statusCode < 300 &&
          accessToken
        ) {
          auth.authorization = normalizeAuthorization(accessToken);
          auth.refreshToken = refreshToken;
          auth.cookie = "";
          auth.csrf = "";

          const saved = saveAuth();
          recoverySummary = "🔐 登录状态：已自动重新登录";
          log(
            "自动重新登录成功，本机保存结果：" +
              Boolean(saved) +
              "，Refresh Token=" +
              Boolean(refreshToken)
          );
          return true;
        }

        if (tokenData.requires_2fa || data.requires_2fa) {
          finish(
            "自动重新登录需要两步验证",
            "请在网页完成验证后重新打开签到页面"
          );
          return false;
        }

        finish(
          "自动重新登录失败",
          "账号密码可能已变化，请在网页重新登录一次"
        );
        return false;
      })
      .catch(() => {
        finish(
          "自动重新登录网络失败",
          "为保护账号，未输出包含请求内容的错误详情"
        );
        return false;
      });
  }

  function recoverAuthentication() {
    return refreshAccessToken().then((result) => {
      if (result === "success") return true;
      if (result === "reauthenticate") return loginWithCredentials();
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
      if (Number(response.statusCode) !== 401 || recoveryAttempted) {
        return response;
      }

      recoveryAttempted = true;
      return recoverAuthentication().then((recovered) => {
        if (!recovered || finished) return null;
        log("登录状态恢复完成，重新发送原请求");
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
        return finishWithDetails(
          "今日已经签到",
          statusData.data,
          "",
          "无需重复签到"
        );
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
        const pointsAwarded =
          data.data && data.data.points_awarded !== undefined
            ? data.data.points_awarded
            : "";

        log("签到成功，正在查询积分详情");
        return $task
          .fetch({
            url: STATUS_URL,
            method: "GET",
            headers: buildHeaders(),
            opts: requestOptions
          })
          .then((detailResponse) => {
            const detailStatusCode = Number(detailResponse.statusCode);
            const detailData = parseJson(detailResponse.body);
            const detailsData =
              detailStatusCode === 200 && detailData.code === 0
                ? detailData.data
                : {};

            log("签到详情接口 HTTP " + detailStatusCode);
            return finishWithDetails(
              "签到成功",
              detailsData,
              pointsAwarded,
              "今日签到完成"
            );
          })
          .catch(() => {
            log("签到成功，但积分详情查询失败");
            return finishWithDetails(
              "签到成功",
              {},
              pointsAwarded,
              "今日签到完成"
            );
          });
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
