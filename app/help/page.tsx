import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import HelpGuide from '@/components/HelpGuide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <AppShell><HelpGuide /></AppShell>;
}