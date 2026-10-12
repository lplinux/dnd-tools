/**
 * pages/Timeline.jsx
 * Re-exports the Timeline page.
 *
 * App.jsx lazy-imports '@/pages/Timeline', and this shim wins that resolution
 * over ./Timeline/index.jsx. Removing it would silently reroute the import to
 * the directory index — which works, but change App.jsx first rather than
 * relying on it.
 */
export { default } from './Timeline/index';
