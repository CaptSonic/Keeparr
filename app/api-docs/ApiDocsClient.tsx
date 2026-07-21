'use client';

import dynamic from 'next/dynamic';
import '@scalar/api-reference-react/style.css';
import { ApiDocsLoading } from '@/components/LocalizedPageText';

// Scalar is heavy — load it client-side only, code-split to this route.
const ApiReferenceReact = dynamic(
  () => import('@scalar/api-reference-react').then((m) => m.ApiReferenceReact),
  { ssr: false, loading: ApiDocsLoading }
);

export default function ApiDocsClient() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/api/openapi.json',
        darkMode: true,
        hideDarkModeToggle: true,
        // Match Keeparr's dark chrome.
        theme: 'kepler',
      }}
    />
  );
}
