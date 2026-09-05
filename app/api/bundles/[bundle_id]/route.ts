import { NextResponse } from 'next/server';
import demoBundle from '../../../../public/code-exploration-bundle.json';

/**
 * A stable opaque fixture ID gives integrations a real transport to exercise in
 * development and demos. Uploaded production bundles continue to use the SAM
 * service in services/bundle-service; this route never accepts arbitrary IDs.
 */
const DEMO_IDS = new Set(['b_demo1234']);

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ bundle_id: string }> }) {
  const { bundle_id: bundleId } = await params;
  if (!/^b_[A-Za-z0-9_-]{8,128}$/.test(bundleId)) {
    return NextResponse.json({ error: { message: 'bundle_id is invalid' } }, { status: 400 });
  }
  if (!DEMO_IDS.has(bundleId)) {
    return NextResponse.json({ error: { message: 'hosted bundle not found or expired' } }, { status: 404 });
  }
  return NextResponse.json(demoBundle, {
    headers: {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}
