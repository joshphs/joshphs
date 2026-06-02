var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker/index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var DAILY_REQUEST_LIMIT = 9e4;
var DAILY_REQUEST_WARN = 7e4;
var DAILY_KV_WRITE_LIMIT = 900;
var PER_IP_HOURLY_LIMIT = 200;
var PROXY_PER_USER_HOURLY = 120;
function getTodayKey() {
  return "usage_" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
__name(getTodayKey, "getTodayKey");
__name2(getTodayKey, "getTodayKey");
__name22(getTodayKey, "getTodayKey");
async function hashPassword(password, salt) {
  const enc = new TextEncoder().encode(salt + ":" + password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
__name2(hashPassword, "hashPassword");
__name22(hashPassword, "hashPassword");
function generateId() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateId, "generateId");
__name2(generateId, "generateId");
__name22(generateId, "generateId");
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateSalt, "generateSalt");
__name2(generateSalt, "generateSalt");
__name22(generateSalt, "generateSalt");
function generateInviteCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) {
    code += chars[arr[i] % chars.length];
  }
  return code;
}
__name(generateInviteCode, "generateInviteCode");
__name2(generateInviteCode, "generateInviteCode");
__name22(generateInviteCode, "generateInviteCode");
function parseUA(ua) {
  let device = "Unknown";
  if (/iPhone/.test(ua))
    device = "iPhone";
  else if (/iPad/.test(ua))
    device = "iPad";
  else if (/Android/.test(ua))
    device = "Android";
  else if (/Macintosh/.test(ua))
    device = "Mac";
  else if (/Windows/.test(ua))
    device = "Windows";
  else if (/Linux/.test(ua))
    device = "Linux";
  let browser = "Unknown";
  if (/Edg\//.test(ua))
    browser = "Edge";
  else if (/Chrome\//.test(ua))
    browser = "Chrome";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua))
    browser = "Safari";
  else if (/Firefox\//.test(ua))
    browser = "Firefox";
  return { device, browser };
}
__name(parseUA, "parseUA");
__name2(parseUA, "parseUA");
__name22(parseUA, "parseUA");
function getSessionToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/vcx_session=([^;]+)/);
  return match ? match[1] : null;
}
__name(getSessionToken, "getSessionToken");
__name2(getSessionToken, "getSessionToken");
__name22(getSessionToken, "getSessionToken");
async function getSession(request, env) {
  const token = getSessionToken(request);
  if (!token)
    return null;
  try {
    const raw = await env.VCX_USERS.get("session:" + token);
    if (!raw)
      return null;
    const session = JSON.parse(raw);
    session.token = token;
    return session;
  } catch (e) {
    return null;
  }
}
__name(getSession, "getSession");
__name2(getSession, "getSession");
__name22(getSession, "getSession");
async function getUser(email, env) {
  try {
    const raw = await env.VCX_USERS.get("user:" + email.toLowerCase());
    if (!raw)
      return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
__name(getUser, "getUser");
__name2(getUser, "getUser");
__name22(getUser, "getUser");
function getUserTier(user) {
  if (!user)
    return "none";
  if (user.isAdmin)
    return "gold";
  if (user.subscriptionStatus !== "active")
    return "copper";
  var plan = user.subscriptionPlan || "";
  if (plan === "monthly" || plan === "5month")
    return "gold";
  if (plan === "silver" || plan === "weekly")
    return "silver";
  if (user.inviteCodeUsed === "admin" || user.inviteCodeUsed === "test" || user.inviteCodeUsed === "invite")
    return "gold";
  return "copper";
}
__name(getUserTier, "getUserTier");
__name2(getUserTier, "getUserTier");
__name22(getUserTier, "getUserTier");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = ["https://stakeandclaim.com", "https://www.stakeandclaim.com"];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const todayKey = getTodayKey();
    let usage = { requests: 0, kvWrites: 0, shutoff: false };
    try {
      const stored = await env.VCX_IPS.get(todayKey);
      if (stored)
        usage = JSON.parse(stored);
    } catch (e) {
    }
    if (usage.shutoff || usage.requests >= DAILY_REQUEST_LIMIT) {
      usage.shutoff = true;
      try {
        await env.VCX_IPS.put(todayKey, JSON.stringify(usage));
      } catch (e) {
      }
      return new Response(JSON.stringify({
        error: "Daily limit reached \u2014 service paused until midnight UTC to stay on free tier.",
        requests_today: usage.requests
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    usage.requests++;
    const saveUsage = /* @__PURE__ */ __name22(async () => {
      if (usage.kvWrites < DAILY_KV_WRITE_LIMIT) {
        usage.kvWrites++;
        try {
          await env.VCX_IPS.put(todayKey, JSON.stringify(usage));
        } catch (e) {
        }
      }
    }, "saveUsage");
    const kvWrite = /* @__PURE__ */ __name22(async (ns, key, value, ttl) => {
      if (usage.kvWrites >= DAILY_KV_WRITE_LIMIT)
        return false;
      usage.kvWrites++;
      const opts = ttl ? { expirationTtl: ttl } : {};
      await ns.put(key, typeof value === "string" ? value : JSON.stringify(value), opts);
      return true;
    }, "kvWrite");
    const path = url.pathname;
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    if (path === "/api/register" || path === "/api/login") {
      const rlKey = "ratelimit:" + clientIP + ":" + path.split("/").pop() + ":" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 16);
      let attempts = 0;
      try {
        const stored = await env.VCX_IPS.get(rlKey);
        if (stored)
          attempts = parseInt(stored);
      } catch (e) {
      }
      if (attempts >= 8) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please wait a minute and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" }
        });
      }
      try {
        await env.VCX_IPS.put(rlKey, String(attempts + 1), { expirationTtl: 120 });
      } catch (e) {
      }
    }
    const hourKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
    const ipHourKey = "rl:ip:" + clientIP + ":" + hourKey;
    let ipHourCount = 0;
    try {
      const stored = await env.VCX_IPS.get(ipHourKey);
      if (stored)
        ipHourCount = parseInt(stored);
    } catch (e) {
    }
    if (ipHourCount >= PER_IP_HOURLY_LIMIT && path !== "/api/login" && path !== "/api/register") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "300" }
      });
    }
    if (ipHourCount % 10 === 0) {
      try {
        await env.VCX_IPS.put(ipHourKey, String(ipHourCount + 1), { expirationTtl: 7200 });
      } catch (e) {
      }
    }
    ipHourCount++;
    const TIER_RL_SKIP = ["/api/login", "/api/register", "/api/logout", "/api/stripe/webhook", "/api/stripe/checkout", "/api/stripe/status", "/api/rate-limit-status"];
    if (!TIER_RL_SKIP.includes(path)) {
      const session = await getSession(request, env);
      if (session) {
        const rlUser = await getUser(session.email, env);
        if (rlUser) {
          const tier = getUserTier(rlUser);
          const TIER_LIMITS = { copper: 30, silver: 100 };
          const limit = TIER_LIMITS[tier];
          if (limit) {
            const createdAt = rlUser.createdAt ? new Date(rlUser.createdAt).getTime() : 0;
            const now = Date.now();
            const isFirstDay = now - createdAt < 864e5;
            if (!isFirstDay) {
              const tierHourKey = "tierrl:" + session.email + ":" + hourKey;
              let tierCount = 0;
              try {
                const stored = await env.VCX_IPS.get(tierHourKey);
                if (stored)
                  tierCount = parseInt(stored);
              } catch (e) {
              }
              if (tierCount >= limit) {
                const nowDate = /* @__PURE__ */ new Date();
                const retryAfter = 3600 - (nowDate.getMinutes() * 60 + nowDate.getSeconds());
                return new Response(JSON.stringify({
                  error: "Rate limit exceeded. Please try again shortly.",
                  tier_limited: true,
                  tier,
                  retry_after: retryAfter,
                  limit,
                  used: tierCount,
                  upgrade_hint: tier === "copper" ? "Upgrade to Silver or Gold for more access." : "Upgrade to Gold for unlimited access."
                }), {
                  status: 429,
                  headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) }
                });
              }
              tierCount++;
              if (tierCount % 5 === 0 || tierCount === 1) {
                try {
                  await env.VCX_IPS.put(tierHourKey, String(tierCount), { expirationTtl: 7200 });
                } catch (e) {
                }
              }
            }
          }
        }
      }
    }
    if (path === "/api/health" && request.method === "GET") {
      const health = { status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString(), uptime: Date.now() };
      try {
        await env.VCX_USERS.get("__health_check__");
        health.kv = "connected";
      } catch (e) {
        health.kv = "error";
        health.status = "degraded";
      }
      try {
        await env.DB.prepare("SELECT 1").first();
        health.d1 = "connected";
      } catch (e) {
        health.d1 = "error";
        health.status = "degraded";
      }
      health.errors_kv = env.VCX_ERRORS ? "bound" : "missing";
      return new Response(JSON.stringify(health), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/errors" && request.method === "POST") {
      try {
        const body = await request.json();
        const errorId = "err_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8);
        const errorData = {
          id: errorId,
          type: body.type || "unknown",
          message: body.message || "",
          source: body.source || "",
          line: body.line || 0,
          column: body.column || 0,
          stack: (body.stack || "").substring(0, 2e3),
          timestamp: body.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
          userAgent: (body.userAgent || "").substring(0, 500),
          url: body.url || "",
          ip: clientIP,
          receivedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (env.VCX_ERRORS) {
          await env.VCX_ERRORS.put(errorId, JSON.stringify(errorData), { expirationTtl: 604800 });
          let recentIds = [];
          try {
            const stored = await env.VCX_ERRORS.get("__recent_ids__");
            if (stored)
              recentIds = JSON.parse(stored);
          } catch (e) {
          }
          recentIds.unshift(errorId);
          if (recentIds.length > 200)
            recentIds = recentIds.slice(0, 200);
          await env.VCX_ERRORS.put("__recent_ids__", JSON.stringify(recentIds));
        }
        return new Response(JSON.stringify({ ok: true, id: errorId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "Failed to store error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/errors/recent" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const user = await getUser(session.email, env);
      if (!user || !user.isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        let recentIds = [];
        const stored = await env.VCX_ERRORS.get("__recent_ids__");
        if (stored)
          recentIds = JSON.parse(stored);
        const errors = [];
        for (const id of recentIds.slice(0, 50)) {
          const errData = await env.VCX_ERRORS.get(id);
          if (errData)
            errors.push(JSON.parse(errData));
        }
        return new Response(JSON.stringify({ errors, total: recentIds.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to fetch errors" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/register" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, username, password, adminCode } = body;
        if (!email || !username || !password) {
          return new Response(JSON.stringify({ error: "Email, username, and password are required." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const emailLower = email.toLowerCase().trim();
        const usernameLower = username.toLowerCase().trim();
        const existing = await env.VCX_USERS.get("user:" + emailLower);
        if (existing) {
          return new Response(JSON.stringify({ error: "An account with this email already exists." }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const existingUsername = await env.VCX_USERS.get("username:" + usernameLower);
        if (existingUsername) {
          return new Response(JSON.stringify({ error: "This username is taken." }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const userId = generateId();
        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        let subscriptionStatus = "none";
        let subscriptionPlan = "copper";
        let inviteCodeUsed = "none";
        let isAdminUser = emailLower === (env.ADMIN_EMAIL || "").toLowerCase();
        if (adminCode) {
          if (adminCode === env.ADMIN_INVITE_CODE) {
            subscriptionStatus = "active";
            subscriptionPlan = "monthly";
            inviteCodeUsed = "admin";
            isAdminUser = true;
          } else if (adminCode === env.TEST_INVITE_CODE) {
            subscriptionStatus = "active";
            subscriptionPlan = "monthly";
            inviteCodeUsed = "test";
          } else {
            try {
              const inviteData = await env.VCX_USERS.get("invite:" + adminCode);
              if (inviteData) {
                subscriptionStatus = "active";
                subscriptionPlan = "monthly";
                inviteCodeUsed = "invite";
                await env.VCX_USERS.delete("invite:" + adminCode);
              }
            } catch (e) {
            }
          }
        }
        const user = {
          id: userId,
          email: emailLower,
          username: username.trim(),
          passwordHash,
          salt,
          createdAt: now,
          subscriptionStatus,
          subscriptionPlan,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          lastLogin: now,
          isAdmin: isAdminUser,
          inviteCodeUsed
        };
        await kvWrite(env.VCX_USERS, "user:" + emailLower, user);
        await kvWrite(env.VCX_USERS, "userindex:" + userId, emailLower);
        await kvWrite(env.VCX_USERS, "username:" + usernameLower, emailLower);
        let userList = [];
        try {
          const raw = await env.VCX_USERS.get("userlist");
          if (raw)
            userList = JSON.parse(raw);
        } catch (e) {
        }
        userList.push({ email: emailLower, username: username.trim(), createdAt: now, id: userId });
        await kvWrite(env.VCX_USERS, "userlist", userList);
        const sessionToken = generateId();
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const session = {
          userId,
          email: emailLower,
          username: username.trim(),
          createdAt: now,
          lastActive: now,
          ip,
          isAdmin: user.isAdmin
        };
        await kvWrite(env.VCX_USERS, "session:" + sessionToken, session);
        await logActivity(env, usage, kvWrite, {
          userId,
          email: emailLower,
          username: username.trim(),
          action: "register",
          detail: "New account created",
          ip
        });
        await saveUsage();
        const tier = getUserTier(user);
        return new Response(JSON.stringify({
          success: true,
          token: sessionToken,
          user: {
            id: userId,
            email: emailLower,
            username: username.trim(),
            subscriptionStatus: user.subscriptionStatus,
            subscriptionPlan: user.subscriptionPlan,
            tier,
            isAdmin: user.isAdmin
          }
        }), {
          status: 201,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": `vcx_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Registration failed: " + e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, password } = body;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password are required." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const emailLower = email.toLowerCase().trim();
        const user = await getUser(emailLower, env);
        if (!user) {
          return new Response(JSON.stringify({ error: "Invalid email or password." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const hash = await hashPassword(password, user.salt);
        if (hash !== user.passwordHash) {
          return new Response(JSON.stringify({ error: "Invalid email or password." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        user.lastLogin = (/* @__PURE__ */ new Date()).toISOString();
        await kvWrite(env.VCX_USERS, "user:" + emailLower, user);
        const sessionToken = generateId();
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const ua = request.headers.get("User-Agent") || "";
        const { device, browser } = parseUA(ua);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const session = {
          userId: user.id,
          email: emailLower,
          username: user.username,
          createdAt: now,
          lastActive: now,
          ip,
          isAdmin: user.isAdmin
        };
        await kvWrite(env.VCX_USERS, "session:" + sessionToken, session);
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let loginLog = [];
        try {
          const raw = await env.VCX_IPS.get("loginlog:" + today);
          if (raw)
            loginLog = JSON.parse(raw);
        } catch (e) {
        }
        loginLog.unshift({
          userId: user.id,
          email: emailLower,
          username: user.username,
          ip,
          device,
          browser,
          timestamp: now
        });
        if (loginLog.length > 1e3)
          loginLog = loginLog.slice(0, 1e3);
        await kvWrite(env.VCX_IPS, "loginlog:" + today, loginLog);
        await logActivity(env, usage, kvWrite, {
          userId: user.id,
          email: emailLower,
          username: user.username,
          action: "login",
          detail: `${device} / ${browser} / ${ip}`,
          ip
        });
        await saveUsage();
        const tier = getUserTier(user);
        return new Response(JSON.stringify({
          success: true,
          token: sessionToken,
          user: {
            id: user.id,
            email: emailLower,
            username: user.username,
            subscriptionStatus: user.subscriptionStatus,
            subscriptionPlan: user.subscriptionPlan || null,
            tier,
            isAdmin: user.isAdmin
          }
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": `vcx_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Login failed: " + e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/logout" && request.method === "POST") {
      const token = getSessionToken(request);
      if (token) {
        try {
          await env.VCX_USERS.delete("session:" + token);
        } catch (e) {
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Set-Cookie": "vcx_session=; Path=/; Max-Age=0"
        }
      });
    }
    if (path === "/api/me") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const user = await getUser(session.email, env);
      if (!user) {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      session.lastActive = (/* @__PURE__ */ new Date()).toISOString();
      await kvWrite(env.VCX_USERS, "session:" + session.token, session);
      const tier = getUserTier(user);
      return new Response(JSON.stringify({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionPlan: user.subscriptionPlan || null,
          tier,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/rate-limit-status") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ tier: "none", limited: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const rlUser = await getUser(session.email, env);
      if (!rlUser)
        return new Response(JSON.stringify({ tier: "none", limited: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const tier = getUserTier(rlUser);
      const TIER_LIMITS = { copper: 30, silver: 100 };
      const limit = TIER_LIMITS[tier];
      if (!limit)
        return new Response(JSON.stringify({ tier, limited: false, unlimited: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const createdAt = rlUser.createdAt ? new Date(rlUser.createdAt).getTime() : 0;
      const isFirstDay = Date.now() - createdAt < 864e5;
      if (isFirstDay)
        return new Response(JSON.stringify({ tier, limited: false, first_day: true, limit }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const tierHourKey = "tierrl:" + session.email + ":" + hourKey;
      let tierCount = 0;
      try {
        const s = await env.VCX_IPS.get(tierHourKey);
        if (s)
          tierCount = parseInt(s);
      } catch (e) {
      }
      const nowDate = /* @__PURE__ */ new Date();
      const retryAfter = 3600 - (nowDate.getMinutes() * 60 + nowDate.getSeconds());
      return new Response(JSON.stringify({ tier, limited: tierCount >= limit, used: tierCount, limit, retry_after: retryAfter, remaining: Math.max(0, limit - tierCount) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path === "/api/activity" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        await logActivity(env, usage, kvWrite, {
          userId: session.userId,
          email: session.email,
          username: session.username,
          action: body.action || "unknown",
          detail: body.detail || "",
          ip
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path.startsWith("/api/admin/")) {
      const session = await getSession(request, env);
      if (!session || !session.isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path === "/api/admin/users") {
        let userList = [];
        try {
          const raw = await env.VCX_USERS.get("userlist");
          if (raw)
            userList = JSON.parse(raw);
        } catch (e) {
        }
        const enriched = [];
        for (const entry of userList.slice(0, 100)) {
          const user = await getUser(entry.email, env);
          if (user) {
            enriched.push({
              id: user.id,
              email: user.email,
              username: user.username,
              subscriptionStatus: user.subscriptionStatus,
              subscriptionPlan: user.subscriptionPlan || null,
              tier: getUserTier(user),
              createdAt: user.createdAt,
              lastLogin: user.lastLogin,
              isAdmin: user.isAdmin
            });
          }
        }
        return new Response(JSON.stringify({ users: enriched, total: userList.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path === "/api/admin/logins") {
        const date = url.searchParams.get("date") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let loginLog = [];
        try {
          const raw = await env.VCX_IPS.get("loginlog:" + date);
          if (raw)
            loginLog = JSON.parse(raw);
        } catch (e) {
        }
        return new Response(JSON.stringify({ date, logins: loginLog }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path === "/api/admin/activity") {
        const date = url.searchParams.get("date") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let activityLog = [];
        try {
          const raw = await env.VCX_IPS.get("activity:" + date);
          if (raw)
            activityLog = JSON.parse(raw);
        } catch (e) {
        }
        return new Response(JSON.stringify({ date, activity: activityLog }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path === "/api/admin/stats") {
        let userList = [];
        try {
          const raw = await env.VCX_USERS.get("userlist");
          if (raw)
            userList = JSON.parse(raw);
        } catch (e) {
        }
        let goldCount = 0, silverCount = 0, copperCount = 0;
        for (const entry of userList) {
          const user = await getUser(entry.email, env);
          if (user) {
            var t = getUserTier(user);
            if (t === "gold")
              goldCount++;
            else if (t === "silver")
              silverCount++;
            else
              copperCount++;
          }
        }
        var monthlyRevenue = (goldCount * 18.97 + silverCount * 1.99 * 4.33).toFixed(2);
        return new Response(JSON.stringify({
          totalUsers: userList.length,
          goldSubscriptions: goldCount,
          silverSubscriptions: silverCount,
          copperUsers: copperCount,
          monthlyRevenue,
          usage: {
            requests_today: usage.requests,
            kv_writes_today: usage.kvWrites,
            pct_used: Math.round(usage.requests / DAILY_REQUEST_LIMIT * 100)
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (path === "/api/admin/set-subscription" && request.method === "POST") {
        try {
          const body = await request.json();
          const user = await getUser(body.email, env);
          if (!user) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          user.subscriptionStatus = body.status || "active";
          if (body.plan)
            user.subscriptionPlan = body.plan;
          await kvWrite(env.VCX_USERS, "user:" + user.email, user);
          return new Response(JSON.stringify({ success: true, user: { email: user.email, subscriptionStatus: user.subscriptionStatus, subscriptionPlan: user.subscriptionPlan, tier: getUserTier(user) } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      if (path === "/api/admin/set-role" && request.method === "POST") {
        try {
          const body = await request.json();
          const targetUser = await getUser(body.email, env);
          if (!targetUser) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          targetUser.isAdmin = body.role === "admin";
          await kvWrite(env.VCX_USERS, "user:" + targetUser.email, targetUser);
          return new Response(JSON.stringify({
            success: true,
            user: { email: targetUser.email, username: targetUser.username, isAdmin: targetUser.isAdmin }
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      if (path === "/api/admin/invite-codes" && request.method === "POST") {
        try {
          const code = generateInviteCode();
          const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1e3).toISOString();
          await kvWrite(env.VCX_USERS, "invite:" + code, JSON.stringify({ createdAt: (/* @__PURE__ */ new Date()).toISOString(), expiresAt }), 21600);
          return new Response(JSON.stringify({
            success: true,
            code,
            expiresAt,
            expiresIn: "6 hours"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      if (path === "/api/admin/invite-codes" && request.method === "GET") {
        try {
          return new Response(JSON.stringify({
            message: "Invite codes are stored with 6-hour TTL. They are automatically deleted after use or expiration.",
            note: "Consider maintaining an invite code index in a separate KV key if you need full tracking."
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
    }
    if (path === "/api/portfolio" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const raw = await env.VCX_USERS.get("portfolio:" + session.email.toLowerCase());
        if (raw) {
          return new Response(raw, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ portfolios: null, hasPortfolio: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/portfolio" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        if (!body.portfolios || !Array.isArray(body.portfolios)) {
          return new Response(JSON.stringify({ error: "portfolios array required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const cleaned = body.portfolios.slice(0, 5).map((p) => ({
          name: (p.name || "My Portfolio").slice(0, 50),
          shares: Math.max(0, Math.min(1e6, Number(p.shares) || 0)),
          trueCostBasis: Math.max(0, Math.min(1e8, Number(p.trueCostBasis) || 0)),
          listingPrice: 18.97,
          investments: (p.investments || []).slice(0, 20).map((inv) => ({
            date: (inv.date || "").slice(0, 10),
            amount: Math.max(0, Number(inv.amount) || 0),
            shares: Math.max(0, Number(inv.shares) || 0),
            price: Math.max(0, Number(inv.price) || 0),
            label: (inv.label || "").slice(0, 100),
            holdingPeriod: inv.holdingPeriod === "short-term" ? "short-term" : "long-term"
          })),
          holdingPeriod: p.holdingPeriod === "short-term" ? "short-term" : "long-term",
          ltShares: Number(p.ltShares) || 0,
          ltBasis: Number(p.ltBasis) || 0,
          stShares: Number(p.stShares) || 0,
          stBasis: Number(p.stBasis) || 0
        }));
        const data = { portfolios: cleaned, hasPortfolio: true, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await kvWrite(env.VCX_USERS, "portfolio:" + session.email.toLowerCase(), data);
        await saveUsage();
        return new Response(JSON.stringify({ success: true, ...data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/usage") {
      await saveUsage();
      return new Response(JSON.stringify({
        requests_today: usage.requests,
        kv_writes_today: usage.kvWrites,
        request_limit: DAILY_REQUEST_LIMIT,
        request_warn: DAILY_REQUEST_WARN,
        kv_write_limit: DAILY_KV_WRITE_LIMIT,
        pct_used: Math.round(usage.requests / DAILY_REQUEST_LIMIT * 100),
        shutoff: usage.shutoff,
        warning: usage.requests >= DAILY_REQUEST_WARN,
        status: usage.requests >= DAILY_REQUEST_WARN ? "WARNING" : "OK"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/proxy") {
      const proxySession = await getSession(request, env);
      if (!proxySession) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const proxyRlKey = "rl:proxy:" + proxySession.email + ":" + hourKey;
      let proxyCount = 0;
      try {
        const stored = await env.VCX_IPS.get(proxyRlKey);
        if (stored)
          proxyCount = parseInt(stored);
      } catch (e) {
      }
      if (proxyCount >= PROXY_PER_USER_HOURLY) {
        return new Response(JSON.stringify({ error: "Proxy rate limit reached. Data refreshes every 5 minutes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "300" }
        });
      }
      if (proxyCount % 5 === 0) {
        try {
          await env.VCX_IPS.put(proxyRlKey, String(proxyCount + 1), { expirationTtl: 7200 });
        } catch (e) {
        }
      }
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url param" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const allowedDomains = [
        "www.reddit.com",
        "old.reddit.com",
        "reddit.com",
        "news.google.com",
        "query1.finance.yahoo.com",
        "query2.finance.yahoo.com",
        "finance.yahoo.com",
        "www.google.com",
        "feeds.finance.yahoo.com",
        "www.bing.com",
        "data.sec.gov",
        "efts.sec.gov",
        "www.sec.gov"
      ];
      if (!allowedDomains.includes(parsed.hostname)) {
        return new Response(JSON.stringify({ error: "Domain not allowed: " + parsed.hostname }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "VCX-Tracker/1.0 (contact: admin@stakeandclaim.com)",
            "Accept": "application/json, text/html, */*"
          },
          cf: { cacheTtl: 300 }
        });
        const contentType = resp.headers.get("Content-Type") || "text/plain";
        const body = await resp.arrayBuffer();
        if (usage.requests % 50 === 0)
          await saveUsage();
        return new Response(body, {
          status: resp.status,
          headers: {
            ...corsHeaders,
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=300"
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Fetch failed: " + e.message }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/log-ip") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const ua = request.headers.get("User-Agent") || "";
      const { device, browser } = parseUA(ua);
      let log = [];
      try {
        const stored = await env.VCX_IPS.get("ip_log");
        if (stored)
          log = JSON.parse(stored);
      } catch (e) {
      }
      log.unshift({ ip, time: now, device, browser, ua: ua.substring(0, 200) });
      if (log.length > 500)
        log = log.slice(0, 500);
      if (usage.kvWrites < DAILY_KV_WRITE_LIMIT) {
        usage.kvWrites++;
        await env.VCX_IPS.put("ip_log", JSON.stringify(log));
      }
      await saveUsage();
      return new Response(JSON.stringify({
        ip,
        log,
        usage_pct: Math.round(usage.requests / DAILY_REQUEST_LIMIT * 100)
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/ip-log") {
      let log = [];
      try {
        const stored = await env.VCX_IPS.get("ip_log");
        if (stored)
          log = JSON.parse(stored);
      } catch (e) {
      }
      return new Response(JSON.stringify({ log }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/messages" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      let messages = [];
      try {
        const raw = await env.VCX_USERS.get("messages");
        if (raw)
          messages = JSON.parse(raw);
      } catch (e) {
      }
      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/messages" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const text = (body.text || "").trim();
        if (!text || text.length > 1e3) {
          return new Response(JSON.stringify({ error: "Message must be 1-1000 characters." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const msgId = generateId();
        let messages = [];
        try {
          const raw = await env.VCX_USERS.get("messages");
          if (raw)
            messages = JSON.parse(raw);
        } catch (e) {
        }
        const newMsg = {
          id: msgId,
          userId: session.userId,
          username: session.username,
          email: session.email,
          isAdmin: session.isAdmin || false,
          text,
          timestamp: now,
          likes: [],
          replies: []
        };
        messages.unshift(newMsg);
        if (messages.length > 500)
          messages = messages.slice(0, 500);
        await kvWrite(env.VCX_USERS, "messages", messages);
        await logActivity(env, usage, kvWrite, {
          userId: session.userId,
          email: session.email,
          username: session.username,
          action: "post_message",
          detail: text.substring(0, 80),
          ip: request.headers.get("CF-Connecting-IP") || "unknown"
        });
        await saveUsage();
        return new Response(JSON.stringify({ success: true, message: newMsg }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/messages/like" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        let messages = [];
        try {
          const raw = await env.VCX_USERS.get("messages");
          if (raw)
            messages = JSON.parse(raw);
        } catch (e) {
        }
        const msg = messages.find((m) => m.id === body.messageId);
        if (!msg) {
          return new Response(JSON.stringify({ error: "Message not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (!msg.likes)
          msg.likes = [];
        const idx = msg.likes.indexOf(session.userId);
        if (idx >= 0) {
          msg.likes.splice(idx, 1);
        } else {
          msg.likes.push(session.userId);
        }
        await kvWrite(env.VCX_USERS, "messages", messages);
        return new Response(JSON.stringify({ success: true, likes: msg.likes.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/messages/reply" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const text = (body.text || "").trim();
        if (!text || text.length > 500) {
          return new Response(JSON.stringify({ error: "Reply must be 1-500 characters." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        let messages = [];
        try {
          const raw = await env.VCX_USERS.get("messages");
          if (raw)
            messages = JSON.parse(raw);
        } catch (e) {
        }
        const msg = messages.find((m) => m.id === body.messageId);
        if (!msg) {
          return new Response(JSON.stringify({ error: "Message not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (!msg.replies)
          msg.replies = [];
        msg.replies.push({
          id: generateId(),
          userId: session.userId,
          username: session.username,
          isAdmin: session.isAdmin || false,
          text,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        await kvWrite(env.VCX_USERS, "messages", messages);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/messages/delete" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session || !session.isAdmin) {
        return new Response(JSON.stringify({ error: "Admin required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        let messages = [];
        try {
          const raw = await env.VCX_USERS.get("messages");
          if (raw)
            messages = JSON.parse(raw);
        } catch (e) {
        }
        messages = messages.filter((m) => m.id !== body.messageId);
        await kvWrite(env.VCX_USERS, "messages", messages);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/support" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const subject = (body.subject || "").trim().slice(0, 200);
        const message = (body.message || "").trim().slice(0, 2e3);
        if (!subject || !message) {
          return new Response(JSON.stringify({ error: "Subject and message are required." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        let tickets = [];
        try {
          const raw = await env.VCX_USERS.get("support_tickets");
          if (raw)
            tickets = JSON.parse(raw);
        } catch (e) {
        }
        const ticket = {
          id: generateId(),
          email: session.email,
          username: session.username,
          subject,
          message,
          status: "open",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          replies: []
        };
        tickets.unshift(ticket);
        if (tickets.length > 500)
          tickets = tickets.slice(0, 500);
        await kvWrite(env.VCX_USERS, "support_tickets", tickets);
        await logActivity(env, usage, kvWrite, {
          userId: session.userId,
          email: session.email,
          username: session.username,
          action: "support_ticket",
          detail: subject,
          ip: request.headers.get("CF-Connecting-IP") || "unknown"
        });
        await saveUsage();
        return new Response(JSON.stringify({ success: true, ticketId: ticket.id }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/support" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      let tickets = [];
      try {
        const raw = await env.VCX_USERS.get("support_tickets");
        if (raw)
          tickets = JSON.parse(raw);
      } catch (e) {
      }
      if (!session.isAdmin) {
        tickets = tickets.filter((t2) => t2.email === session.email);
      }
      return new Response(JSON.stringify({ tickets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (path === "/api/support/reply" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session || !session.isAdmin) {
        return new Response(JSON.stringify({ error: "Admin required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const body = await request.json();
        const text = (body.text || "").trim().slice(0, 2e3);
        const newStatus = body.status;
        if (!text || !body.ticketId) {
          return new Response(JSON.stringify({ error: "ticketId and text required." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        let tickets = [];
        try {
          const raw = await env.VCX_USERS.get("support_tickets");
          if (raw)
            tickets = JSON.parse(raw);
        } catch (e) {
        }
        const ticket = tickets.find((t2) => t2.id === body.ticketId);
        if (!ticket) {
          return new Response(JSON.stringify({ error: "Ticket not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (!ticket.replies)
          ticket.replies = [];
        ticket.replies.push({
          from: session.username,
          isAdmin: true,
          text,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (newStatus)
          ticket.status = newStatus;
        await kvWrite(env.VCX_USERS, "support_tickets", tickets);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/calculate/scenario" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        const { currentPrice, targetPrices, portfolios } = await request.json();
        if (!currentPrice || !targetPrices || !portfolios || !Array.isArray(targetPrices)) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const TAX = {
          fed_lt: 0.15,
          niit: 0.038,
          ca_lt: 0.093,
          fed_st: 0.24,
          ca_st: 0.093,
          combined_lt: 0.283,
          combined_st: 0.371
        };
        const results = targetPrices.map((tp) => {
          let totalVal = 0, totalCost = 0, totalTax = 0;
          const portResults = portfolios.map((p) => {
            const val = tp * p.shares;
            const gain = val - p.costBasis;
            let tax = 0;
            if (p.ltShares && p.stShares) {
              const ltGain = tp * p.ltShares - p.ltBasis;
              const stGain = tp * p.stShares - p.stBasis;
              tax = (ltGain > 0 ? ltGain * TAX.combined_lt : 0) + (stGain > 0 ? stGain * TAX.combined_st : 0);
            } else {
              tax = gain > 0 ? gain * TAX.combined_lt : 0;
            }
            totalVal += val;
            totalCost += p.costBasis;
            totalTax += tax;
            return { name: p.name, value: val, gain, tax, afterTax: val - tax };
          });
          return {
            price: tp,
            portfolios: portResults,
            combined: { value: totalVal, cost: totalCost, gain: totalVal - totalCost, tax: totalTax, afterTax: totalVal - totalTax }
          };
        });
        return new Response(JSON.stringify({ results, taxRates: TAX, computed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/tax-rates" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        fed_lt: 0.15,
        niit: 0.038,
        ca_lt: 0.093,
        fed_st: 0.24,
        ca_st: 0.093,
        combined_lt: 0.283,
        combined_st: 0.371,
        note: "Rates are estimates based on current federal and California schedules. For informational purposes only \u2014 not tax advice."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" }
      });
    }
    const STRIPE_SECRET = env.STRIPE_SECRET_KEY;
    const STRIPE_PRICE_MONTHLY = "price_1TFCTQPl0iXskC6GyzvjujFk";
    const STRIPE_PRICE_5MONTH = "price_1TFCTRPl0iXskC6GSMcxrqW3";
    const STRIPE_PRICE_SILVER = "price_1TGXevPl0iXskC6GfY3w2wsG";
    if (path === "/api/stripe/checkout" && request.method === "POST") {
      try {
        const session = await getSession(request, env);
        if (!session) {
          return new Response(JSON.stringify({ error: "Not authenticated" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const body = await request.json();
        const plan = body.plan || "monthly";
        let priceId, mode;
        if (plan === "silver" || plan === "weekly") {
          priceId = STRIPE_PRICE_SILVER;
          mode = "subscription";
        } else if (plan === "5month") {
          priceId = STRIPE_PRICE_5MONTH;
          mode = "payment";
        } else {
          priceId = STRIPE_PRICE_MONTHLY;
          mode = "subscription";
        }
        const params = new URLSearchParams();
        params.append("payment_method_types[]", "card");
        params.append("line_items[0][price]", priceId);
        params.append("line_items[0][quantity]", "1");
        params.append("mode", mode);
        params.append("success_url", "https://stakeandclaim.com/?payment=success");
        params.append("cancel_url", "https://stakeandclaim.com/?payment=cancelled");
        params.append("customer_email", session.email);
        params.append("client_reference_id", session.email);
        params.append("metadata[email]", session.email);
        params.append("metadata[plan]", plan);
        const stripeResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(STRIPE_SECRET + ":"),
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        });
        const stripeData = await stripeResp.json();
        if (stripeData.error) {
          return new Response(JSON.stringify({ error: stripeData.error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        await saveUsage();
        return new Response(JSON.stringify({ url: stripeData.url, sessionId: stripeData.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/stripe/webhook" && request.method === "POST") {
      try {
        const payload = await request.text();
        const event = JSON.parse(payload);
        if (event.type === "checkout.session.completed") {
          const sessionData = event.data.object;
          const email = sessionData.customer_email || sessionData.metadata?.email;
          const plan = sessionData.metadata?.plan || "monthly";
          if (email) {
            const user = await getUser(email, env);
            if (user) {
              user.subscriptionStatus = "active";
              user.subscriptionPlan = plan;
              user.stripeCustomerId = sessionData.customer;
              user.stripeSessionId = sessionData.id;
              user.subscribedAt = (/* @__PURE__ */ new Date()).toISOString();
              if (plan === "5month") {
                const expiry = /* @__PURE__ */ new Date();
                expiry.setMonth(expiry.getMonth() + 5);
                user.subscriptionExpiry = expiry.toISOString();
              }
              await kvWrite(env.VCX_USERS, "user:" + email.toLowerCase(), user);
              await logActivity(env, usage, kvWrite, {
                userId: user.id,
                email,
                username: user.username,
                action: "subscription_activated",
                detail: `Plan: ${plan}, Tier: ${getUserTier(user)}, Amount: ${sessionData.amount_total / 100}`,
                ip: request.headers.get("CF-Connecting-IP") || "stripe-webhook"
              });
            }
          }
        }
        if (event.type === "customer.subscription.deleted") {
          const sub = event.data.object;
          const email = sub.metadata?.email;
          if (email) {
            const user = await getUser(email, env);
            if (user) {
              user.subscriptionStatus = "cancelled";
              user.cancelledAt = (/* @__PURE__ */ new Date()).toISOString();
              await kvWrite(env.VCX_USERS, "user:" + email.toLowerCase(), user);
            }
          }
        }
        await saveUsage();
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/stripe/status" && request.method === "GET") {
      try {
        const session = await getSession(request, env);
        if (!session) {
          return new Response(JSON.stringify({ error: "Not authenticated" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const user = await getUser(session.email, env);
        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (user.subscriptionPlan === "5month" && user.subscriptionExpiry) {
          if (/* @__PURE__ */ new Date() > new Date(user.subscriptionExpiry)) {
            user.subscriptionStatus = "expired";
            await kvWrite(env.VCX_USERS, "user:" + session.email.toLowerCase(), user);
          }
        }
        return new Response(JSON.stringify({
          status: user.subscriptionStatus || "none",
          plan: user.subscriptionPlan || null,
          tier: getUserTier(user),
          subscribedAt: user.subscribedAt || null,
          expiry: user.subscriptionExpiry || null
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/suggestions" && request.method === "POST") {
      try {
        const session = await getSession(request, env);
        if (!session) {
          return new Response(JSON.stringify({ error: "Authentication required" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const body = await request.json();
        const { text } = body;
        if (!text || text.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Suggestion text is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const suggestion = {
          id: generateId(),
          userId: session.userId,
          email: session.email,
          username: session.username,
          text: text.trim(),
          createdAt: now,
          status: "new"
        };
        let suggestions = [];
        try {
          const raw = await env.VCX_USERS.get("suggestions");
          if (raw)
            suggestions = JSON.parse(raw);
        } catch (e) {
        }
        suggestions.unshift(suggestion);
        if (suggestions.length > 500)
          suggestions = suggestions.slice(0, 500);
        await kvWrite(env.VCX_USERS, "suggestions", suggestions);
        await logActivity(env, usage, kvWrite, {
          userId: session.userId,
          email: session.email,
          username: session.username,
          action: "suggestion",
          detail: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
          ip: request.headers.get("CF-Connecting-IP") || "unknown"
        });
        return new Response(JSON.stringify({ success: true, id: suggestion.id }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/suggestions" && request.method === "GET") {
      try {
        const session = await getSession(request, env);
        if (!session || !session.isAdmin) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        let suggestions = [];
        try {
          const raw = await env.VCX_USERS.get("suggestions");
          if (raw)
            suggestions = JSON.parse(raw);
        } catch (e) {
        }
        return new Response(JSON.stringify({ suggestions }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/companies" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, ticker, name, sector, exchange, is_public, ipo_date, lockup_end_date, logo_url, website FROM companies ORDER BY ticker"
        ).all();
        return new Response(JSON.stringify({ companies: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path.startsWith("/api/v2/companies/") && request.method === "GET") {
      const ticker = path.split("/")[4].toUpperCase();
      try {
        const company = await env.DB.prepare(
          "SELECT * FROM companies WHERE ticker = ?"
        ).bind(ticker).first();
        if (!company) {
          return new Response(JSON.stringify({ error: "Company not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ company }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/companies" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const user = await getUser(session.email, env);
      if (!user || !user.isAdmin)
        return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const body = await request.json();
        const { ticker, name, description, sector, exchange, is_public, ipo_date, lockup_end_date, cik, website } = body;
        if (!ticker || !name)
          return new Response(JSON.stringify({ error: "ticker and name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        await env.DB.prepare(
          "INSERT INTO companies (ticker, name, description, sector, exchange, is_public, ipo_date, lockup_end_date, cik, website) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(ticker.toUpperCase(), name, description || null, sector || null, exchange || null, is_public ? 1 : 0, ipo_date || null, lockup_end_date || null, cik || null, website || null).run();
        return new Response(JSON.stringify({ ok: true, ticker: ticker.toUpperCase() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/holdings" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const dbUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(session.email.toLowerCase()).first();
        if (!dbUser)
          return new Response(JSON.stringify({ error: "User not found in D1" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { results } = await env.DB.prepare(
          `SELECT h.id, h.shares, h.cost_basis, h.acquisition_date, h.share_type, h.vesting_schedule, h.lockup_expiry, h.notes, h.source, h.created_at,
                  c.ticker, c.name as company_name, c.sector, c.exchange, c.lockup_end_date as company_lockup
           FROM holdings h JOIN companies c ON h.company_id = c.id
           WHERE h.user_id = ? ORDER BY c.ticker`
        ).bind(dbUser.id).all();
        return new Response(JSON.stringify({ holdings: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/holdings" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const dbUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(session.email.toLowerCase()).first();
        if (!dbUser)
          return new Response(JSON.stringify({ error: "User not found in D1" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const body = await request.json();
        const { ticker, shares, cost_basis, acquisition_date, share_type, vesting_schedule, lockup_expiry, notes } = body;
        if (!ticker || !shares)
          return new Response(JSON.stringify({ error: "ticker and shares required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        let company = await env.DB.prepare("SELECT id FROM companies WHERE ticker = ?").bind(ticker.toUpperCase()).first();
        if (!company) {
          await env.DB.prepare("INSERT INTO companies (ticker, name) VALUES (?, ?)").bind(ticker.toUpperCase(), ticker.toUpperCase()).run();
          company = await env.DB.prepare("SELECT id FROM companies WHERE ticker = ?").bind(ticker.toUpperCase()).first();
        }
        await env.DB.prepare(
          `INSERT INTO holdings (user_id, company_id, shares, cost_basis, acquisition_date, share_type, vesting_schedule, lockup_expiry, notes, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
        ).bind(dbUser.id, company.id, shares, cost_basis || null, acquisition_date || null, share_type || "common", vesting_schedule || null, lockup_expiry || null, notes || null).run();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path.startsWith("/api/v2/holdings/") && request.method === "DELETE") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const holdingId = parseInt(path.split("/")[4]);
      try {
        const dbUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(session.email.toLowerCase()).first();
        if (!dbUser)
          return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const result = await env.DB.prepare("DELETE FROM holdings WHERE id = ? AND user_id = ?").bind(holdingId, dbUser.id).run();
        return new Response(JSON.stringify({ ok: true, deleted: result.meta.changes }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/holdings/import-csv" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const dbUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(session.email.toLowerCase()).first();
        if (!dbUser)
          return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const body = await request.json();
        const rows = body.rows;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          return new Response(JSON.stringify({ error: "rows array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (rows.length > 500) {
          return new Response(JSON.stringify({ error: "Max 500 rows per import" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await env.DB.prepare(
          "INSERT INTO import_jobs (user_id, type, status, records_total) VALUES (?, 'csv', 'processing', ?)"
        ).bind(dbUser.id, rows.length).run();
        const job = await env.DB.prepare("SELECT id FROM import_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(dbUser.id).first();
        let imported = 0;
        let errors = [];
        for (const row of rows) {
          try {
            if (!row.ticker || !row.shares) {
              errors.push("Missing ticker/shares in row");
              continue;
            }
            let company = await env.DB.prepare("SELECT id FROM companies WHERE ticker = ?").bind(row.ticker.toUpperCase()).first();
            if (!company) {
              await env.DB.prepare("INSERT INTO companies (ticker, name) VALUES (?, ?)").bind(row.ticker.toUpperCase(), row.ticker.toUpperCase()).run();
              company = await env.DB.prepare("SELECT id FROM companies WHERE ticker = ?").bind(row.ticker.toUpperCase()).first();
            }
            await env.DB.prepare(
              `INSERT INTO holdings (user_id, company_id, shares, cost_basis, acquisition_date, share_type, source)
               VALUES (?, ?, ?, ?, ?, ?, 'csv')`
            ).bind(dbUser.id, company.id, parseFloat(row.shares), row.cost_basis ? parseFloat(row.cost_basis) : null, row.acquisition_date || null, row.share_type || "common").run();
            imported++;
          } catch (rowErr) {
            errors.push(row.ticker + ": " + rowErr.message);
          }
        }
        await env.DB.prepare(
          "UPDATE import_jobs SET status = ?, records_imported = ?, error_log = ?, completed_at = datetime('now') WHERE id = ?"
        ).bind(errors.length === 0 ? "completed" : "completed", imported, errors.length > 0 ? JSON.stringify(errors) : null, job.id).run();
        return new Response(JSON.stringify({ ok: true, imported, total: rows.length, errors: errors.length > 0 ? errors : void 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/user" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const dbUser = await env.DB.prepare(
          "SELECT id, email, display_name, tier, is_admin, created_at, last_login FROM users WHERE email = ?"
        ).bind(session.email.toLowerCase()).first();
        if (!dbUser)
          return new Response(JSON.stringify({ error: "User not found in D1" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ user: dbUser }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/admin/users" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const user = await getUser(session.email, env);
      if (!user || !user.isAdmin)
        return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, email, display_name, tier, is_admin, created_at, last_login FROM users ORDER BY id"
        ).all();
        return new Response(JSON.stringify({ users: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/v2/admin/stats" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session)
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const user = await getUser(session.email, env);
      if (!user || !user.isAdmin)
        return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      try {
        const stats = await env.DB.prepare(`
          SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM users WHERE tier='admin') as admins,
            (SELECT COUNT(*) FROM users WHERE tier='gold') as gold_users,
            (SELECT COUNT(*) FROM users WHERE tier='silver') as silver_users,
            (SELECT COUNT(*) FROM users WHERE tier='copper') as copper_users,
            (SELECT COUNT(*) FROM companies) as total_companies,
            (SELECT COUNT(*) FROM holdings) as total_holdings,
            (SELECT COUNT(*) FROM import_jobs) as total_imports
        `).first();
        return new Response(JSON.stringify({ stats }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (usage.requests % 50 === 0)
      await saveUsage();
    return new Response("VCX API \u2014 Not Found", { status: 404, headers: corsHeaders });
  }
};
async function logActivity(env, usage, kvWrite, { userId, email, username, action, detail, ip }) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let log = [];
  try {
    const raw = await env.VCX_IPS.get("activity:" + today);
    if (raw)
      log = JSON.parse(raw);
  } catch (e) {
  }
  log.unshift({ userId, email, username, action, detail, ip, timestamp: now });
  if (log.length > 2e3)
    log = log.slice(0, 2e3);
  await kvWrite(env.VCX_IPS, "activity:" + today, log);
}
__name(logActivity, "logActivity");
__name2(logActivity, "logActivity");
__name22(logActivity, "logActivity");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

