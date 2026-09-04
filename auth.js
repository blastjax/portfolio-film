const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE_NAME = 'fp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const CREDENTIALS_PATH = path.join(__dirname, 'data', 'admin-credentials.json');

// ---- Admin password --------------------------------------------------------
// A single shared admin password, not a username/password-per-person system.
// Set ADMIN_PASSWORD to choose your own; otherwise one is generated on first
// run and its hash persisted to data/admin-credentials.json.

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function loadOrCreateCredentials() {
  const envPassword = process.env.ADMIN_PASSWORD;
  if (envPassword) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: hashPassword(envPassword, salt) };
  }

  if (fs.existsSync(CREDENTIALS_PATH)) {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  }

  const password = crypto.randomBytes(12).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ salt, hash }, null, 2));

  console.log('\n================================================================');
  console.log('  No ADMIN_PASSWORD set — generated an admin password for you:');
  console.log(`  ${password}`);
  console.log('  Save it now; it will not be shown again. Log in at /login.');
  console.log('  (Set the ADMIN_PASSWORD env var to choose your own instead.)');
  console.log('================================================================\n');

  return { salt, hash };
}

const credentials = loadOrCreateCredentials();

function verifyPassword(password) {
  if (typeof password !== 'string' || !password) return false;
  const candidate = Buffer.from(hashPassword(password, credentials.salt), 'hex');
  const expected = Buffer.from(credentials.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---- Sessions ---------------------------------------------------------------
// In-memory only: restarting the server logs everyone out. Fine for a small
// self-hosted personal site.

const sessions = new Map(); // token -> expiresAt

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

// Periodic cleanup so expired sessions don't accumulate forever.
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (now > expiresAt) sessions.delete(token);
  }
}, 60 * 60 * 1000).unref();

// ---- Cookies ------------------------------------------------------------

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function attachCookies(req, res, next) {
  req.cookies = parseCookies(req);
  next();
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

function requireAuth(req, res, next) {
  if (!isValidSession(req.cookies && req.cookies[COOKIE_NAME])) {
    return res.status(401).json({ error: 'Login required.' });
  }
  next();
}

// ---- Login rate limiting -------------------------------------------------

const attempts = new Map(); // ip -> { count, lockUntil }

function isLockedOut(ip) {
  const rec = attempts.get(ip);
  if (!rec || !rec.lockUntil) return false;
  if (Date.now() >= rec.lockUntil) {
    attempts.delete(ip);
    return false;
  }
  return true;
}

function recordFailedAttempt(ip) {
  const rec = attempts.get(ip) || { count: 0 };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) rec.lockUntil = Date.now() + LOCKOUT_MS;
  attempts.set(ip, rec);
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

module.exports = {
  COOKIE_NAME,
  verifyPassword,
  createSession,
  isValidSession,
  destroySession,
  attachCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  isLockedOut,
  recordFailedAttempt,
  clearAttempts,
};
