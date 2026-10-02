/**
 * pages/JourneyMapPublic/DetailsPanel.jsx
 *
 * The right-hand panel. Shows one of three views depending on the current
 * selection: the map overview (default), a selected location, or a selected
 * path. Event chips inside the panel report hover upward so the page can show
 * the shared <EventTooltip>.
 */

import {
  isRegion, parseWaypoints, waypointEvents, linkedEventsForLoc, travelTimes, sameId,
  computePathDistance, roadDistance,
} from '@/components/map/geometry';

const ROUTE_LABEL = { road: '🛣️ Road', flight: '✈️ Flight route', maritime: '⚓ Maritime route' };
import { InfoCard, InfoRow } from '@/components/ui';
import { EventChip } from './Tooltips';

function TravelBadge({ icon, time, label }) {
  return (
    <div className="bg-surface3 border border-border rounded-sm px-1 py-[5px] text-center">
      <span className="text-sm block">{icon}</span>
      <div className="text-[11px] text-gold font-semibold mt-0.5">{time}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}

const emptyNote = (text) => (
  <div className="text-text-muted italic text-[11px] text-center py-6">{text}</div>
);

/* ── Default: map overview ─────────────────────────────────── */
function MapDetails({ data, onSelectPath }) {
  // A route is only listed when all its anchored locations are visible. `data.locations`
  // already excludes DM-hidden locations, so a route with a waypoint whose locId isn't in
  // that set touches a hidden place → hide it from the panel. (Routes stay in `data.paths`
  // for distance calc; only the listing is filtered.) Movement paths are always listed.
  const visLocIds = new Set((data.locations || []).map((l) => String(l.id)));
  const routeVisible = (p) =>
    parseWaypoints(p).every((w) => w.locId == null || visLocIds.has(String(w.locId)));
  const listPaths = (data.paths || []).filter((p) => (p.kind === 'route' ? routeVisible(p) : true));

  return (
    <>
      <InfoCard title={`🗺️ ${data.map.name}`}>
        {data.map.description && (
          <p className="text-[12px] text-text-dim mt-1">{data.map.description}</p>
        )}
        <div className="mt-1.5">
          <InfoRow label="Locations">{(data.locations || []).length}</InfoRow>
          <InfoRow label="Paths">{listPaths.length}</InfoRow>
        </div>
      </InfoCard>

      {listPaths.length > 0 && (
        <InfoCard title="Paths">
          {listPaths.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPath(p.id)}
              className="flex items-center gap-[7px] w-full text-left px-2 py-1.5 bg-surface2 border border-border rounded-sm mb-[5px] text-[13px] hover:border-[var(--gold-dim)] transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.tracker_color || '#c9a84c' }} />
              <span>{p.name || 'Path'}</span>
              {p.distance_miles && <span className="ml-auto text-[11px] text-text-dim">{p.distance_miles}mi</span>}
            </button>
          ))}
        </InfoCard>
      )}

      {emptyNote('Click any pin or path on the map for details.')}
    </>
  );
}

/* ── Selected location ─────────────────────────────────────── */
function LocationDetails({ loc, data, eventHandlers }) {
  const linkedEvents = linkedEventsForLoc(loc.id, data.paths);
  const myDists = (data.distances || []).filter(
    (d) => sameId(d.from_loc_id, loc.id) || sameId(d.to_loc_id, loc.id),
  );

  return (
    <>
      {loc.size_type && (
        <InfoCard>
          <InfoRow label="Type"><span className="capitalize">{loc.size_type}</span></InfoRow>
        </InfoCard>
      )}

      {loc.location_description && (
        <InfoCard title="📖 Description">
          <p className="text-[12px] text-text-dim leading-[1.5] m-0">{loc.location_description}</p>
        </InfoCard>
      )}

      {linkedEvents.length > 0 && (
        <InfoCard title="🗓 Linked Events">
          {linkedEvents.map((e) => (
            <div key={e.id} className="flex items-start py-[3px] border-b border-border last:border-b-0 text-[12px]">
              <EventChip event={e} {...eventHandlers} />
              <span className="text-[10px] text-text-dim ml-auto">{e.pathName}</span>
            </div>
          ))}
        </InfoCard>
      )}

      <InfoCard title="📏 Distances">
        {myDists.length === 0 && emptyNote('No distances set.')}
        {myDists.map((d, i) => {
          const otherId = sameId(d.from_loc_id, loc.id) ? d.to_loc_id : d.from_loc_id;
          const toLoc = (data.locations || []).find((l) => sameId(l.id, otherId));
          if (!toLoc) return null;
          const mi = parseFloat(d.distance_miles);
          const t = travelTimes(mi);
          return (
            <div key={i} className="flex justify-between items-center py-[3px] border-b border-border last:border-b-0 gap-2 text-[12px]">
              <span className="text-text-dim">📍 {toLoc.name}</span>
              <span className="text-text font-semibold text-right">
                {mi} mi <span className="text-text-dim text-[10px]">(🚶{t.walk} 🐎{t.horse} 🦅{t.fly})</span>
              </span>
            </div>
          );
        })}
      </InfoCard>
    </>
  );
}

/* ── Selected path ─────────────────────────────────────────── */
function PathDetails({ path, data, eventHandlers }) {
  const wpts = parseWaypoints(path);
  const isRoute = path.kind === 'route';
  const route = isRoute
    ? roadDistance(wpts, data.locations || [])
    : computePathDistance(wpts, data.distances || [], data.locations || []);
  const dist = route.complete ? route.miles : null;
  const t = !isRoute && dist != null ? travelTimes(dist) : null;

  return (
    <>
      <InfoCard title={isRoute ? 'Road' : 'Movement'}>
        <InfoRow label={isRoute ? 'Type' : 'Name'}>
          {isRoute
            ? (ROUTE_LABEL[path.route_type] || ROUTE_LABEL.road)
            : <span style={{ color: path.tracker_color || '#c9a84c' }}>{path.tracker_name || '—'}</span>}
        </InfoRow>
        {dist != null && <InfoRow label="Distance">{dist} mi</InfoRow>}
      </InfoCard>

      {route.sections.length > 0 && (
        <InfoCard title="🧭 Route Sections">
          {route.sections.map((sec) => (
            <InfoRow key={sec.index} label={<span className="truncate">{sec.fromName} → {sec.toName}</span>} dim={sec.miles == null}>
              {sec.miles == null ? '—' : `${sec.miles} mi`}
            </InfoRow>
          ))}
        </InfoCard>
      )}

      {t && (
        <InfoCard title="⏱ Travel Times">
          <div className="grid grid-cols-3 gap-[5px] mt-2">
            <TravelBadge icon="🚶" time={t.walk} label="Walking" />
            <TravelBadge icon="🐎" time={t.horse} label="Horse" />
            <TravelBadge icon="🦅" time={t.fly} label="Flying" />
          </div>
        </InfoCard>
      )}

      {path.notes && (
        <InfoCard title="📝 Notes">
          <p className="text-[12px] text-text-dim leading-[1.5]">{path.notes}</p>
        </InfoCard>
      )}

      {wpts.length > 0 && (
        <InfoCard title="Waypoints">
          {wpts.map((w, i) => {
            const loc = w.locId ? (data.locations || []).find((l) => sameId(l.id, w.locId)) : null;
            const evs = waypointEvents(w);
            return (
              <div key={i} className="flex flex-wrap items-center gap-[3px] py-[3px] text-[12px]">
                <span>{i === 0 ? '⊙' : '→'} {loc ? `📍 ${loc.name}` : `Point ${i + 1}`}</span>
                {evs.length > 0 && (
                  <div className="flex flex-wrap gap-[2px] pl-1">
                    {evs.map((e) => <EventChip key={e.id} event={e} {...eventHandlers} />)}
                  </div>
                )}
              </div>
            );
          })}
        </InfoCard>
      )}
    </>
  );
}

export default function DetailsPanel({ data, selection, onSelectPath, eventHandlers }) {
  let head = 'Map Details';
  let body = <MapDetails data={data} onSelectPath={onSelectPath} />;

  if (selection?.kind === 'loc') {
    const loc = (data.locations || []).find((l) => sameId(l.id, selection.id));
    if (loc) {
      head = `${isRegion(loc) ? '🗾' : '📍'} ${loc.name}`;
      body = <LocationDetails loc={loc} data={data} eventHandlers={eventHandlers} />;
    }
  } else if (selection?.kind === 'path') {
    const path = (data.paths || []).find((p) => sameId(p.id, selection.id));
    if (path) {
      head = `🛤️ ${path.name || 'Path'}`;
      body = <PathDetails path={path} data={data} eventHandlers={eventHandlers} />;
    }
  }

  return (
    <aside className="bg-surface border-l border-border flex flex-col overflow-hidden">
      <div className="bg-surface2 border-b border-border px-3.5 py-2.5 font-display text-[0.75rem] text-gold tracking-wider uppercase flex-shrink-0">
        {head}
      </div>
      <div className="flex-1 overflow-y-auto p-3">{body}</div>
    </aside>
  );
}
