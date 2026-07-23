import { redirect } from 'next/navigation';

// Land on the deployment dashboard; the (protected) guard forwards
// unauthenticated visitors to /login.
export default function Home() {
  redirect('/dashboard');
}
