/*
 * Holivator authentication capture for Quantumult X.
 * Sensitive values stay in Quantumult X preferences on this device.
 */

const STORAGE_KEY = "holivator_auth_v1";

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

try {
  const headers = $request.headers || {};
  const oldRaw = $prefs.valueForKey(STORAGE_KEY);
  const oldData = oldRaw ? JSON.parse(oldRaw) : {};
  const cookie = getHeader(headers, "Cookie") || oldData.cookie || "";
  const authorization =
    getHeader(headers, "Authorization") || oldData.authorization || "";
  const csrf =
    getHeader(headers, "X-CSRF-Token") ||
    getCookie(cookie, "csrf_token") ||
    oldData.csrf ||
    "";

  const nextData = {
    authorization,
    cookie,
    csrf,
    capturedAt: new Date().toISOString()
  };

  if (authorization || cookie) {
    const changed =
      authorization !== (oldData.authorization || "") ||
      cookie !== (oldData.cookie || "") ||
      csrf !== (oldData.csrf || "");

    $prefs.setValueForKey(JSON.stringify(nextData), STORAGE_KEY);

    if (!oldRaw || changed) {
      $notify(
        "Holivator 自动签到",
        "登录状态已保存到本机",
        "未上传账号、Cookie 或 Token"
      );
    }
  }
} catch (error) {
  $notify("Holivator 自动签到", "保存登录状态失败", String(error));
}

$done({});
