/**
 * pages/JourneyMapPublic/index.jsx
 *
 * Read-only public view of a journey map, accessed via a share token
 * (`/journey-map-public/:token`). Pan/zoomable map with location pins,
 * polygon regions and directed travel paths, plus a details panel.
 *
 * Access: Public. Data comes from `GET /api/journey-map-public/:token`
 * (`{ map, locations, distances, paths, events }`) or 404.
 *
 * Idiomatic React port of the former public/journey-map-public.html — the
 * pan/zoom + SVG rendering now live in the reusable <MapStage> + layer
 * components rather than imperative DOM string building.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { journeyMapsApi } from '@/api/journeyMaps';
import { useAsync } from '@/hooks/useAsync';
import { linkedEventsForLoc, effectiveDistances } from '@/components/map/geometry';
import { useMapViewport } from '@/components/map/useMapViewport';
import AppHeader from '@/components/layout/AppHeader';
import MapStage from '@/components/map/MapStage';
import { Badge, Spinner } from '@/components/ui';

import { Regions, Pins, Paths } from './MapLayers';
import { PinTooltip, EventTooltip } from './Tooltips';
import DetailsPanel from './DetailsPanel';

function CenterMessage({ icon, children }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
      <div className="text-5xl opacity-40">{icon}</div>
      <p className="font-display tracking-wider">{children}</p>
    </div>
  );
}

export default function JourneyMapPublic() {
  const { token } = useParams();
  const viewport = useMapViewport();
  const { data, loading, error } = useAsync(
    () => journeyMapsApi.publicData(token),
    { autoRun: true, deps: [token] },
  );

  // selection: { kind: 'loc' | 'path', id } | null — last click wins.
  const [selection, setSelection] = useState(null);
  const [pinTip, setPinTip] = useState(null); // { loc, linkedEvents, x, y }
  const [evTip, setEvTip] = useState(null);   // { ev, x, y }

  useEffect(() => {
    document.title = data?.map?.name ? `🗺️ ${data.map.name}` : '🗺️ Journey Map';
  }, [data]);

  const selLoc = selection?.kind === 'loc' ? selection.id : null;
  const selPath = selection?.kind === 'path' ? selection.id : null;

  // All distances derive from the road network (falling back to stored matrix).
  const dist = useMemo(
    () => effectiveDistances(data?.paths || [], data?.distances || []),
    [data],
  );
  const dataWithDist = useMemo(() => ({ ...data, distances: dist }), [data, dist]);

  const selectLoc = (id) => { setPinTip(null); setSelection({ kind: 'loc', id }); };
  const selectPath = (id) => setSelection({ kind: 'path', id });

  // Pin/region hover → location tooltip
  const onPinHover = (loc, e) =>
    setPinTip({
      loc,
      linkedEvents: linkedEventsForLoc(loc.id, data.paths),
      x: e.clientX,
      y: e.clientY,
    });
  const onPinLeave = () => setPinTip(null);

  // Event-chip hover → event tooltip (shared by panel + pin tooltip)
  const eventHandlers = {
    onHover: (id, e) => {
      const ev = data.events?.[id];
      if (ev) setEvTip({ ev, x: e.clientX, y: e.clientY });
    },
    onMove: (id, e) => {
      const ev = data.events?.[id];
      if (ev) setEvTip({ ev, x: e.clientX, y: e.clientY });
    },
    onLeave: () => setEvTip(null),
  };

  return (
    <>
      <AppHeader icon="🗺️" name="Journey Path Map" hideBack>
        {data?.map?.name && (
          <span className="text-[0.8rem] text-text-dim italic">{data.map.name}</span>
        )}
        <Badge variant="default">👁 Read Only</Badge>
      </AppHeader>

      {loading && <CenterMessage icon={<Spinner className="w-8 h-8" />}>Loading map…</CenterMessage>}

      {!loading && error && <CenterMessage icon="🗺️">{error}</CenterMessage>}

      {!loading && !error && data && (
        <div
          className="flex-1 grid overflow-hidden min-h-0"
          style={{ gridTemplateColumns: '1fr 260px' }}
        >
          <MapStage viewport={viewport} imageSrc={data.map.map_image || null}>
            {({ iw, ih }) => (
              <>
                {/* Layer order (bottom → top): regions, routes/paths, pins. */}
                <Regions
                  locations={data.locations || []}
                  iw={iw}
                  ih={ih}
                  selLoc={selLoc}
                  onSelect={selectLoc}
                  onHover={onPinHover}
                  onLeave={onPinLeave}
                />
                <Paths paths={data.paths || []} iw={iw} ih={ih} selPath={selPath} distances={dist} locations={data.locations || []} onSelect={selectPath} />
                <Pins
                  locations={data.locations || []}
                  typeImages={data.type_images || {}}
                  iw={iw}
                  ih={ih}
                  selLoc={selLoc}
                  onSelect={selectLoc}
                  onHover={onPinHover}
                  onLeave={onPinLeave}
                />
              </>
            )}
          </MapStage>

          <DetailsPanel
            data={dataWithDist}
            selection={selection}
            onSelectPath={selectPath}
            eventHandlers={eventHandlers}
          />
        </div>
      )}

      {/* Cursor-following tooltips (fixed-position, rendered above everything) */}
      {pinTip && <PinTooltip tip={pinTip} events={data.events} />}
      {evTip && <EventTooltip tip={evTip} />}
    </>
  );
}
