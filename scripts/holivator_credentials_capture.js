/*
 * Stage Holivator username and password for automatic re-login.
 * Credentials are promoted to active storage only after an authenticated
 * check-in request is observed.
 */

const PENDING_CREDENTIALS_KEY = "holivator_credentials_pending_v1";

function log(message) {
  if (typeof console !== "undefined" && console.log) {
    console.log("[Holivator Credentials] " + message);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_) {
    return {};
  }
}

try {
  const url =
    typeof $request !== "undefined" ? String($request.url || "") : "";
  const method =
    typeof $request !== "undefined"
      ? String($request.method || "").toUpperCase()
      : "";
  const data = parseJson(
    typeof $request !== "undefined" ? $request.body : ""
  );
  const username =
    typeof data.username === "string" ? data.username.trim() : "";
  const password =
    typeof data.password === "string" ? data.password : "";
  const exactLoginEndpoint =
    method === "POST" &&
    /^https:\/\/holivator\.de\/api\/v1\/auth\/login(?:\?.*)?$/.test(url);

  if (exactLoginEndpoint && username && password) {
    const saved = $prefs.setValueForKey(
      JSON.stringify({
        username,
        password,
        capturedAt: new Date().toISOString()
      }),
      PENDING_CREDENTIALS_KEY
    );
    log(
      "待确认凭据保存结果：" +
        Boolean(saved) +
        "，Username=true，Password=true"
    );
  } else {
    log("未保存：请求不是有效的账号密码登录请求");
  }
} catch (error) {
  log("暂存自动登录凭据失败");
  $notify(
    "Holivator 自动签到",
    "暂存自动登录凭据失败",
    "请检查 QuanX 日志"
  );
}

$done({ body: $request.body });
