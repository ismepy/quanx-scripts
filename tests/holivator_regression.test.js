const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const scripts = {
  authResponse: fs.readFileSync(
    path.join(root, "scripts/holivator_auth_response.js"),
    "utf8"
  ),
  capture: fs.readFileSync(
    path.join(root, "scripts/holivator_capture.js"),
    "utf8"
  ),
  checkin: fs.readFileSync(
    path.join(root, "scripts/holivator_checkin.js"),
    "utf8"
  ),
  clear: fs.readFileSync(
    path.join(root, "scripts/holivator_clear_credentials.js"),
    "utf8"
  ),
  credentialsCapture: fs.readFileSync(
    path.join(root, "scripts/holivator_credentials_capture.js"),
    "utf8"
  )
};

function jsonResponse(statusCode, value) {
  return Promise.resolve({
    statusCode,
    body: JSON.stringify(value)
  });
}

function createPrefs(initial = {}) {
  const values = { ...initial };
  return {
    values,
    api: {
      valueForKey(key) {
        return values[key] || "";
      },
      setValueForKey(value, key) {
        values[key] = value;
        return true;
      },
      removeValueForKey(key) {
        delete values[key];
        return true;
      }
    }
  };
}

async function runCheckin(handler, initialPrefs = {}) {
  const prefs = createPrefs({
    holivator_auth_v1: JSON.stringify({
      authorization: "Bearer current-access",
      refreshToken: "current-refresh"
    }),
    holivator_credentials_v1: JSON.stringify({
      username: "local-user",
      password: "local-password"
    }),
    ...initialPrefs
  });
  const calls = [];
  const logs = [];
  const notices = [];
  let doneResolve;
  const done = new Promise((resolve) => {
    doneResolve = resolve;
  });

  const sandbox = {
    console: { log(message) { logs.push(String(message)); } },
    $environment: { variables: { "force-timeout": "120000" } },
    $prefs: prefs.api,
    $notify(title, subtitle, body) {
      notices.push({ title, subtitle, body });
    },
    $done() { doneResolve(); },
    setTimeout(callback, milliseconds) {
      if (milliseconds < 50000) Promise.resolve().then(callback);
      return 1;
    },
    clearTimeout() {},
    $task: {
      fetch(request) {
        calls.push(request);
        const custom = handler(request, calls);
        if (custom !== undefined) return custom;
        if (request.url.includes("/user/media-accounts")) {
          return jsonResponse(200, { code: 0, data: { items: [] } });
        }
        if (request.url.endsWith("/user/me")) {
          return jsonResponse(200, { code: 0, data: { point: 100 } });
        }
        throw new Error("Unhandled request: " + request.url);
      }
    }
  };

  vm.runInNewContext(scripts.checkin, sandbox);
  await done;
  return { calls, logs, notices, prefs: prefs.values };
}

async function runRewrite(code, options) {
  const notices = [];
  const logs = [];
  let doneValue;
  let doneResolve;
  const done = new Promise((resolve) => {
    doneResolve = resolve;
  });
  const sandbox = {
    console: { log(message) { logs.push(String(message)); } },
    $prefs: options.prefs.api,
    $request: options.request || {},
    $response: options.response,
    $notify(title, subtitle, body) {
      notices.push({ title, subtitle, body });
    },
    $task: {
      fetch(request) {
        if (!options.fetch) {
          throw new Error("Unexpected fetch: " + request.url);
        }
        return options.fetch(request);
      }
    },
    $done(value) {
      doneValue = value;
      doneResolve();
    }
  };

  vm.runInNewContext(code, sandbox);
  await done;
  return { doneValue, logs, notices };
}

function countCalls(calls, suffix) {
  return calls.filter((request) => request.url.endsWith(suffix)).length;
}

async function testAuthenticationRecovery() {
  let statusCalls = 0;
  let refreshCalls = 0;
  let loginCalls = 0;
  const result = await runCheckin((request) => {
    if (request.url.endsWith("/auth/refresh")) {
      refreshCalls += 1;
      return Promise.reject(new Error("simulated refresh outage"));
    }
    if (request.url.endsWith("/auth/login")) {
      loginCalls += 1;
      if (loginCalls === 1) {
        return Promise.reject(new Error("simulated login outage"));
      }
      return jsonResponse(200, {
        code: 0,
        data: {
          access_token: "new-access",
          refresh_token: "new-refresh"
        }
      });
    }
    if (request.url.endsWith("/user/checkin/status")) {
      statusCalls += 1;
      if (statusCalls === 1) return jsonResponse(401, {});
      if (statusCalls === 2) {
        return jsonResponse(200, {
          code: 0,
          data: { checked_in_today: false, can_checkin: true }
        });
      }
      return jsonResponse(200, {
        code: 0,
        data: {
          checked_in_today: true,
          today_points: 8,
          streak: 6
        }
      });
    }
    if (request.url.endsWith("/user/checkin")) {
      return jsonResponse(200, {
        code: 0,
        data: { points_awarded: 8 }
      });
    }
  });

  assert.strictEqual(result.notices[0].subtitle, "✅ 签到成功");
  assert.strictEqual(refreshCalls, 2);
  assert.strictEqual(loginCalls, 2);
  assert.strictEqual(
    JSON.parse(result.prefs.holivator_auth_v1).authorization,
    "Bearer new-access"
  );
}

async function testStatusGuards() {
  const scenarios = [
    {
      response: jsonResponse(403, {}),
      expected: "签到状态查询被拒绝"
    },
    {
      response: jsonResponse(200, { code: 1, message: "bad status" }),
      expected: "签到状态查询失败"
    },
    {
      response: jsonResponse(200, {
        code: 0,
        data: { checked_in_today: false, can_checkin: false }
      }),
      expected: "当前不可签到"
    }
  ];

  for (const scenario of scenarios) {
    const result = await runCheckin((request) => {
      if (request.url.endsWith("/user/checkin/status")) {
        return scenario.response;
      }
      if (request.url.endsWith("/user/checkin")) {
        throw new Error("Guarded status must not submit check-in");
      }
    });
    assert(result.notices[0].subtitle.includes(scenario.expected));
    assert.strictEqual(countCalls(result.calls, "/user/checkin"), 0);
  }
}

async function testUncertainSubmissionIsConfirmed() {
  let statusCalls = 0;
  const result = await runCheckin((request) => {
    if (request.url.endsWith("/user/checkin/status")) {
      statusCalls += 1;
      return jsonResponse(200, {
        code: 0,
        data:
          statusCalls === 1
            ? { checked_in_today: false, can_checkin: true }
            : { checked_in_today: true, today_points: 9, streak: 7 }
      });
    }
    if (request.url.endsWith("/user/checkin")) {
      return Promise.reject(new Error("response lost"));
    }
  });

  assert.strictEqual(result.notices[0].subtitle, "✅ 签到成功");
  assert.strictEqual(countCalls(result.calls, "/user/checkin"), 2);
  assert(result.notices[0].body.includes("今日积分：9"));
}

async function testServerErrorAndDuplicateAreConfirmed() {
  for (const mode of ["server-error", "duplicate"]) {
    let statusCalls = 0;
    const result = await runCheckin((request) => {
      if (request.url.endsWith("/user/checkin/status")) {
        statusCalls += 1;
        return jsonResponse(200, {
          code: 0,
          data:
            statusCalls === 1
              ? { checked_in_today: false, can_checkin: true }
              : { checked_in_today: true, today_points: 11, streak: 9 }
        });
      }
      if (request.url.endsWith("/user/checkin")) {
        if (mode === "server-error") return jsonResponse(503, {});
        return jsonResponse(400, {
          code: 1,
          detail: { code: "ALREADY_CHECKED_IN", message: "already checked in" }
        });
      }
    });

    assert.strictEqual(
      result.notices[0].subtitle,
      mode === "duplicate" ? "📅 今日已签到" : "✅ 签到成功"
    );
    assert(result.notices[0].body.includes("连续签到：9 天"));
  }
}

async function testDetailRequestsRetry() {
  let mediaCalls = 0;
  let userCalls = 0;
  const result = await runCheckin((request) => {
    if (request.url.endsWith("/user/checkin/status")) {
      return jsonResponse(200, {
        code: 0,
        data: { checked_in_today: true, today_points: 5, streak: 3 }
      });
    }
    if (request.url.includes("/user/media-accounts")) {
      mediaCalls += 1;
      if (mediaCalls === 1) return jsonResponse(503, {});
      return jsonResponse(200, {
        code: 0,
        data: { items: [{ expires_at: "2026-09-07T14:59:00Z" }] }
      });
    }
    if (request.url.endsWith("/user/me")) {
      userCalls += 1;
      if (userCalls === 1) return Promise.reject(new Error("temporary"));
      return jsonResponse(200, { code: 0, data: { point: 88 } });
    }
  });

  assert.strictEqual(mediaCalls, 2);
  assert.strictEqual(userCalls, 2);
  assert(result.notices[0].body.includes("媒体账号过期：2026-09-07 22:59"));
  assert(result.notices[0].body.includes("用户当前积分：88"));
}

async function testCredentialCorrelation() {
  const prefs = createPrefs({
    holivator_auth_v1: JSON.stringify({
      authorization: "Bearer old-access"
    })
  });
  await runRewrite(scripts.credentialsCapture, {
    prefs,
    request: {
      url: "https://holivator.de/api/v1/auth/login",
      method: "POST",
      body: JSON.stringify({
        username: "local-user",
        password: "local-password"
      })
    }
  });
  const pending = JSON.parse(
    prefs.values.holivator_credentials_pending_v1
  );
  assert.strictEqual(pending.previousAuthorization, "Bearer old-access");

  await runRewrite(scripts.capture, {
    prefs,
    request: {
      headers: { Authorization: "Bearer old-access" }
    }
  });
  assert.strictEqual(prefs.values.holivator_credentials_v1, undefined);

  await runRewrite(scripts.capture, {
    prefs,
    request: {
      headers: { Authorization: "Bearer new-access" }
    },
    fetch() {
      return jsonResponse(200, {
        code: 0,
        data: { username: "another-user" }
      });
    }
  });
  assert.strictEqual(prefs.values.holivator_credentials_v1, undefined);

  await runRewrite(scripts.capture, {
    prefs,
    request: {
      headers: { Authorization: "Bearer new-access" }
    },
    fetch() {
      return jsonResponse(200, {
        code: 0,
        data: { username: "local-user" }
      });
    }
  });
  assert.strictEqual(
    JSON.parse(prefs.values.holivator_credentials_v1).password,
    "local-password"
  );
}

async function testAuthResponseValidationAndClear() {
  const prefs = createPrefs();
  const request = {
    url: "https://holivator.de/api/v1/auth/refresh",
    method: "POST",
    body: JSON.stringify({ refresh_token: "old-refresh" })
  };

  await runRewrite(scripts.authResponse, {
    prefs,
    request,
    response: {
      statusCode: 400,
      body: JSON.stringify({
        code: 1,
        data: { access_token: "must-not-save" }
      })
    }
  });
  assert.strictEqual(prefs.values.holivator_auth_v1, undefined);

  await runRewrite(scripts.authResponse, {
    prefs,
    request,
    response: {
      statusCode: 200,
      body: JSON.stringify({
        code: 0,
        data: {
          access_token: "saved-access",
          refresh_token: "saved-refresh"
        }
      })
    }
  });
  assert.strictEqual(
    JSON.parse(prefs.values.holivator_auth_v1).authorization,
    "Bearer saved-access"
  );

  prefs.values.holivator_credentials_v1 = "secret";
  prefs.values.holivator_credentials_pending_v1 = "pending";
  await runRewrite(scripts.clear, { prefs, request: {} });
  assert.strictEqual(prefs.values.holivator_auth_v1, undefined);
  assert.strictEqual(prefs.values.holivator_credentials_v1, undefined);
  assert.strictEqual(
    prefs.values.holivator_credentials_pending_v1,
    undefined
  );
}

async function main() {
  await testAuthenticationRecovery();
  await testStatusGuards();
  await testUncertainSubmissionIsConfirmed();
  await testServerErrorAndDuplicateAreConfirmed();
  await testDetailRequestsRetry();
  await testCredentialCorrelation();
  await testAuthResponseValidationAndClear();
  process.stdout.write("Holivator regression tests passed\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
