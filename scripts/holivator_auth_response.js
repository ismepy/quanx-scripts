/*
 * Capture Holivator access and refresh tokens after a successful login.
 * Sensitive values stay in Quantumult X preferences on this device.
 */

const STORAGE_KEY = "holivator_auth_v1";

function log(message) {
  if (typeof console !== "undefined" && console.log) {
    console.log("[Holivator Auth] " + message);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_) {
    return {};
  }
}

function normalizeAuthorization(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return /^Bearer\s+/i.test(value) ? value : "Bearer " + value;
}

log("登录响应重写规则已命中");

try {
  const responseData = parseJson($response.body);
  const url =
    typeof $request !== "undefined" ? String($request.url || "") : "";
  const method =
    typeof $request !== "undefined"
      ? String($request.method || "").toUpperCase()
      : "";
  const statusCode = Number(
    typeof $response !== "undefined" && $response.statusCode
      ? $response.statusCode
      : 200
  );
  const exactAuthEndpoint =
    method === "POST" &&
    /^https:\/\/holivator\.de\/api\/v1\/auth\/(?:verify-2fa|refresh)(?:\?.*)?$/.test(
      url
    );
  const data =
    responseData && typeof responseData.data === "object"
      ? responseData.data
      : responseData;
  const requestData = parseJson(
    typeof $request !== "undefined" ? $request.body : ""
  );
  const accessToken =
    data.access_token || data.accessToken || "";
  const refreshToken =
    data.refresh_token ||
    data.refreshToken ||
    requestData.refresh_token ||
    requestData.refreshToken ||
    "";

  if (
    exactAuthEndpoint &&
    statusCode >= 200 &&
    statusCode < 300 &&
    responseData.code === 0 &&
    accessToken
  ) {
    const oldRaw = $prefs.valueForKey(STORAGE_KEY);
    const oldData = oldRaw ? parseJson(oldRaw) : {};
    const nextData = {
      authorization: normalizeAuthorization(accessToken),
      cookie: oldData.cookie || "",
      csrf: oldData.csrf || "",
      refreshToken: refreshToken || oldData.refreshToken || "",
      capturedAt: new Date().toISOString()
    };
    const saved = $prefs.setValueForKey(
      JSON.stringify(nextData),
      STORAGE_KEY
    );

    log(
      "本机保存结果：" +
        Boolean(saved) +
        "，Access Token=true，Refresh Token=" +
        Boolean(nextData.refreshToken)
    );

    if (saved && nextData.refreshToken) {
      $notify(
        "Holivator 自动签到",
        "登录令牌已保存",
        "自动续期已启用；令牌仅保存在本机"
      );
    }
  } else {
    log("响应不是成功的续期或两步验证结果，未保存令牌");
  }
} catch (error) {
  log("保存登录令牌失败");
  $notify(
    "Holivator 自动签到",
    "保存登录令牌失败",
    "请检查 QuanX 日志"
  );
}

$done({});
