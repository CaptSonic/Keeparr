import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { normalizeLocale } from '@/lib/i18n';
import { setUserLocale } from '@/lib/queries';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const locale = normalizeLocale(body.locale);
    if (!locale || body.locale !== locale) {
      return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
    }
    setUserLocale(user.plexUserId, locale);
    return NextResponse.json({ ok: true, locale });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}