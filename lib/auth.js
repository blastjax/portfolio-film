import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COOKIE_NAME = 'fp_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const CREDENTIALS_PATH = path.join(process.cwd(), 'data', 'admin-credentials.json');

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

function getCredentials() {
  if (!global.__filmPortfolioCredentials) {
    global.__filmPortfolioCredentials = loadOrCreateCredentials();
  }
  return global.__filmPortfolioCredentials;
}

export function verifyPassword(password) {
  if (typeof password !== 'string' || !password) return false;
  const credentials = getCredentials();
  const candidate = Buffer.from(hashPassword(password, credentials.salt), 'hex');
  const expected = Buffer.from(credentials.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---- Sessions ---------------------------------------------------------------
// In-memory only: restarting the server logs everyone out. Cached on
// `global` so Next.js dev-mode hot reload doesn't wipe the session map.

function getSessions() {
  if (!global.__filmPortfolioSessions) {
    global.__filmPortfolioSessions = new Map(); // token -> expiresAt
    setInterval(() => {
      const now = Date.now();
      for (const [token, expiresAt] of global.__filmPortfolioSessions) {
        if (now > expiresAt) global.__filmPortfolioSessions.delete(token);
      }
    }, 60 * 60 * 1000).unref();
  }
  return global.__filmPortfolioSessions;
}

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  getSessions().set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isValidSession(token) {
  if (!token) return false;
  const sessions = getSessions();
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  if (token) getSessions().delete(token);
}

// ---- Login rate limiting -------------------------------------------------

function getAttempts() {
  if (!global.__filmPortfolioLoginAttempts) {
    global.__filmPortfolioLoginAttempts = new Map(); // ip -> { count, lockUntil }
  }
  return global.__filmPortfolioLoginAttempts;
}

export function isLockedOut(ip) {
  const attempts = getAttempts();
  const rec = attempts.get(ip);
  if (!rec || !rec.lockUntil) return false;
  if (Date.now() >= rec.lockUntil) {
    attempts.delete(ip);
    return false;
  }
  return true;
}

export function recordFailedAttempt(ip) {
  const attempts = getAttempts();
  const rec = attempts.get(ip) || { count: 0 };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) rec.lockUntil = Date.now() + LOCKOUT_MS;
  attempts.set(ip, rec);
}

export function clearAttempts(ip) {
  getAttempts().delete(ip);
}

// Best-effort client IP: trusts X-Forwarded-For if present (e.g. behind a
// reverse proxy), otherwise groups all direct requests under one bucket —
// still an effective global rate limit for a small self-hosted app.
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

// Reads the session cookie off an incoming Request/NextRequest.
export function isAuthenticated(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE_NAME}=`));
  const token = match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
  return isValidSession(token);
}
