import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import ApiDocsClient from './ApiDocsClient';

export const metadata = { title: 'Keeparr API' };

/** Interactive API reference (session-gated; the spec is /api/openapi.json). */
export default async function ApiDocsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/api-docs');
  return <ApiDocsClient />;
}
