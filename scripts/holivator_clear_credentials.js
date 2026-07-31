/*
 * Manually remove all Holivator authentication data from Quantumult X.
 */

const KEYS = [
  "holivator_auth_v1",
  "holivator_credentials_v1",
  "holivator_credentials_pending_v1"
];

KEYS.forEach((key) => $prefs.removeValueForKey(key));
const success = KEYS.every((key) => !$prefs.valueForKey(key));

if (typeof console !== "undefined" && console.log) {
  console.log(
    "[Holivator Clear] 本机登录数据清除结果：" + Boolean(success)
  );
}

$notify(
  "Holivator 自动签到",
  success ? "本机登录数据已清除" : "本机登录数据可能未完全清除",
  "如需继续自动签到，请重新登录 Holivator"
);
$done();
