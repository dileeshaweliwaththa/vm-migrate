import { redirect } from 'next/navigation';

// The tracker is the app. Send the root straight to it; the (protected) guard
// forwards unauthenticated visitors to /login.
export default function Home() {
  redirect('/tracker');
}
