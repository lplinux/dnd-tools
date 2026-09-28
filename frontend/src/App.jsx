import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Layout + landing kept eager: tiny and needed immediately.
import AppLayout from '@/components/layout/AppLayout';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

// Every other page is lazy-loaded so it ships as its own chunk and only
// downloads on first navigation (keeps the initial bundle small).
const TimelinePage = lazy(() => import('@/pages/Timeline'));
const ManageCampaignsPage = lazy(() => import('@/pages/ManageCampaigns'));
const JourneyMapPage = lazy(() => import('@/pages/JourneyMap'));
const PcSheetPage = lazy(() => import('@/pages/PcSheet'));
const NpcSheetPage = lazy(() => import('@/pages/NpcSheet'));
const ItemCardsPage = lazy(() => import('@/pages/ItemCards'));
const PdfViewerPage = lazy(() => import('@/pages/PdfViewer'));
const SplitViewPage = lazy(() => import('@/pages/SplitView'));
const UserPanelPage = lazy(() => import('@/pages/UserPanel'));

// Public token pages
const PcPublicPage = lazy(() => import('@/pages/PcPublic'));
const JourneyMapPublicPage = lazy(() => import('@/pages/JourneyMapPublic'));
const TimelinePublicPage = lazy(() => import('@/pages/TimelinePublic'));

/**
 * ProtectedRoute — redirects to "/" when role requirements are not met.
 *
 * @param {string[]} roles  - Allowed roles. Empty array = any authenticated user.
 * @param {React.ReactNode} children
 */
function ProtectedRoute({ roles = [], children }) {
  const { user, loading } = useAuth();
  if (loading) return null; // AuthContext is still fetching session
  if (!user) return <Navigate to="/" replace />;
  if (roles.length > 0 && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────── */}
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />

        {/* Public tools (no auth required) */}
        <Route path="npc-sheet"  element={<NpcSheetPage />} />
        <Route path="item-cards" element={<ItemCardsPage />} />
        <Route path="split-view" element={<SplitViewPage />} />

        {/* Public share links */}
        <Route path="pc-public/:token"           element={<PcPublicPage />} />
        <Route path="journey-map-public/:token"  element={<JourneyMapPublicPage />} />
        <Route path="timeline-public/:token"     element={<TimelinePublicPage />} />

        {/* ── Authenticated (DM + Player) ──────────────── */}
        <Route
          path="timeline"
          element={
            <ProtectedRoute roles={['dm', 'player']}>
              <TimelinePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="pc-sheet"
          element={
            <ProtectedRoute roles={['dm', 'player']}>
              <PcSheetPage />
            </ProtectedRoute>
          }
        />

        {/* ── DM only ──────────────────────────────────── */}
        <Route
          path="manage-campaigns"
          element={
            <ProtectedRoute roles={['dm']}>
              <ManageCampaignsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="journey-map"
          element={
            <ProtectedRoute roles={['dm']}>
              <JourneyMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="pdf-viewer"
          element={
            <ProtectedRoute roles={['dm']}>
              <PdfViewerPage />
            </ProtectedRoute>
          }
        />

        {/* ── Admin only ───────────────────────────────── */}
        <Route
          path="user-panel"
          element={
            <ProtectedRoute roles={['admin']}>
              <UserPanelPage />
            </ProtectedRoute>
          }
        />

        {/* ── 404 ─────────────────────────────────────── */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
