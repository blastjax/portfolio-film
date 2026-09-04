import { NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  verifyPassword,
  createSession,
  isLockedOut,
  recordFailedAttempt,
  clearAttempts,
  getClientIp,
} from '../../../lib/auth';

export async function POST(request) {
  const ip = getClientIp(request);
  if (isLockedOut(ip)) {
    return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyPassword(body.password)) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  clearAttempts(ip);
  const token = createSession();

  const secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}
