import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/route-helpers';
import spec from '../../../openapi.json';

export const runtime = 'nodejs';

/** The OpenAPI document (rendered interactively at /api-docs). */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(spec);
  } catch (e) {
    return errorResponse(e);
  }
}
