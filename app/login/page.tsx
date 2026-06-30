import { Suspense } from 'react';
import {
  getMediaServerType,
  getServerName,
  isServerConfigured,
  readSetting,
} from '@/lib/settings';
import { countAdmins } from '@/lib/queries';
import LoginClient from './LoginClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // Drive the login UI from the configured backend. The server-type chooser is
  // only shown on a brand-new install (no type chosen yet AND no admin); an
  // existing Plex install (admin present) skips straight to its normal login.
  const typeChosen = readSetting('media_server_type') != null;
  const hasAdmin = countAdmins() > 0;
  return (
    <Suspense>
      <LoginClient
        type={getMediaServerType()}
        chooserNeeded={!typeChosen && !hasAdmin}
        configured={isServerConfigured()}
        serverName={getServerName() ?? ''}
      />
    </Suspense>
  );
}
