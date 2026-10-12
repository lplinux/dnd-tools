/**
 * pages/NotFound.jsx
 *
 * 404 fallback page.
 */

import { useNavigate } from 'react-router-dom';
import AppHeader from '@/components/layout/AppHeader';
import Button from '@/components/ui/Button';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <>
      <AppHeader icon="🎲" name="D&D Tools" hideBack />
      <main className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
        <p className="font-display text-gold text-5xl">404</p>
        <p className="font-display uppercase tracking-wider text-text-dim text-lg">
          Page Not Found
        </p>
        <p className="font-body text-text-dim max-w-sm">
          The page you were looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button variant="accent" onClick={() => navigate('/')}>
          ← Return Home
        </Button>
      </main>
    </>
  );
}
