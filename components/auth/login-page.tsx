'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmailSignUp } from '@/hooks/auth/useEmailSignUp';
import { useVerifyOtp } from '@/hooks/auth/useVerifyOtp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const emailSignUp = useEmailSignUp();
  const verifyOtp = useVerifyOtp();

  function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    emailSignUp.mutate(
      { email },
      {
        onSuccess: (res) => {
          if (res.success) {
            setStep('code');
            setMessage('We emailed you a 6-digit code. Enter it below to sign in.');
          } else {
            setMessage(res.message || 'Could not send the code. Please try again.');
          }
        },
        onError: (error) =>
          setMessage(error instanceof Error ? error.message : 'Something went wrong.'),
      }
    );
  }

  function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    verifyOtp.mutate(
      { email, token: code },
      {
        onSuccess: (res) => {
          if (res.success) {
            router.push('/dashboard');
            router.refresh();
          } else {
            setMessage(res.message || 'Invalid or expired code.');
          }
        },
        onError: (error) =>
          setMessage(error instanceof Error ? error.message : 'Something went wrong.'),
      }
    );
  }

  const isSending = emailSignUp.isPending;
  const isVerifying = verifyOtp.isPending;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-6 py-16">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">Welcome back</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Enter your email and we’ll send you a 6-digit sign-in code.'
              : `Enter the 6-digit code we sent to ${email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form className="space-y-4" onSubmit={handleSendCode}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSending}>
                {isSending ? 'Sending…' : 'Send Code'}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleVerify}>
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  className="tracking-[0.5em]"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isVerifying || code.length < 6}>
                {isVerifying ? 'Verifying…' : 'Verify & Sign In'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setMessage('');
                }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                ← Use a different email
              </button>
            </form>
          )}
          {message ? (
            <p className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
