import { verifyOtp } from '@/services/auth/authService';
import { NextResponse } from 'next/server';

// POST /api/auth/verify — exchange an emailed 6-digit code for a session.
// verifyOtp runs on the server Supabase client, so the auth cookies are set on
// this response and the user is signed in once it returns.
export async function POST(request: Request) {
  try {
    const { email, token } = await request.json();

    if (!email || typeof email !== 'string' || !token || typeof token !== 'string') {
      return NextResponse.json(
        { response: { success: false, message: 'Email and code are required.' } },
        { status: 400 }
      );
    }

    const response = await verifyOtp(email, token.trim());

    return NextResponse.json({ response }, { status: response.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { response: { success: false, message: error instanceof Error ? error.message : 'Unexpected error.' } },
      { status: 500 }
    );
  }
}
