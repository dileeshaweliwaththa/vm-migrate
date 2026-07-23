import { emailSignUp } from '@/services/auth/authService';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { response: { success: false, message: 'A valid email address is required.' } },
        { status: 400 }
      );
    }

    const response = await emailSignUp(email);

    return NextResponse.json({ response }, { status: response.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { response: { success: false, message: error instanceof Error ? error.message : 'Unexpected error.' } },
      { status: 500 }
    );
  }
}