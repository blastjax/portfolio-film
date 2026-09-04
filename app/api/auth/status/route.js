import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../../lib/auth';

export async function GET(request) {
  return NextResponse.json({ loggedIn: isAuthenticated(request) });
}
