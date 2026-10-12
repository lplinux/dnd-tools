/**
 * components/layout/AppLayout.jsx
 *
 * Root layout shell used by all pages via React Router's <Outlet>.
 * Provides a full-height flex-column container:
 *
 *   <AppHeader /> (rendered by each page via context or passed as prop)
 *   <main>        (flex-1, overflow-hidden — page controls its own scroll)
 *
 * Pages that need a header should render <AppHeader> as the first child of
 * their page component. AppLayout simply ensures the vertical layout is correct.
 */

import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui';

export default function AppLayout() {
  return (
    // The #root div in index.html already sets height:100%; flex; flex-direction:column
    // so this wrapper just needs to fill that space.
    <div className="flex flex-col h-full min-h-0">
      {/* Lazy-loaded pages show a spinner while their chunk downloads. */}
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Spinner /></div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
