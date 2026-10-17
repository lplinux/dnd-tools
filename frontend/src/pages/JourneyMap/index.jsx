/**
 * pages/JourneyMap/index.jsx
 *
 * Journey Path Map — DM editor (campaigns → maps → locations/routes/derived paths).
 *
 * Phase 3: page shell, header controls, three-column layout, sidebar, and a
 * read-only map render with click-selection (reusing the public SVG layers).
 * Editing interactions (place/drag/draw/region/measure) arrive in Phase 4+.
 *
 * Idiomatic React port of the former public/journey-map.html (removed). Access: DM.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useJourneyMap } from '@/hooks/useJourneyMap';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { sameId, distanceBetween } from '@/components/map/geometry';
import { useMapViewport } from '@/components/map/useMapViewport';
import { REGION_SIZE_TYPES } from './constants';

import AppHeader from '@/components/layout/AppHeader';
import MapStage from '@/components/map/MapStage';
import { Select, Button } from '@/components/ui';

import Sidebar from './Sidebar';
import DetailsPanel from './DetailsPanel';
import MeasurePanel from './MeasurePanel';
import { EditorPaths, EditorRegions, EditorPins, DrawPreview, RegionPreview, MeasureOverlay } from './EditorLayers';
import { useMapInteraction } from './useMapInteraction';
import NewMapModal from './modals/NewMapModal';
import ShareModal from './modals/ShareModal';
import NamingModal from './modals/NamingModal';
import DistanceModal from './modals/DistanceModal';
import DistanceMatrixModal from './modals/DistanceMatrixModal';
import WaypointEventModal from './modals/WaypointEventModal';

/** Map area cursor by active tool. */
const TOOL_CURSORS = {
  select: 'cursor-default',
  pan: 'cursor-grab active:cursor-grabbing',
  place: 'cursor-crosshair',
  region: 'cursor-crosshair',
  draw: 'cursor-crosshair',
  measure: 'cursor-crosshair',
  delete: 'cursor-not-allowed',
};

export default function JourneyMap() {
  const jm = useJourneyMap();

  /*
   * `?campaign=<id>&map=<id>` — what the globe beside a location in Manage
   * Campaigns links to, mirroring the Timeline module's own params.
   *
   * Once only. Without the ref this re-runs whenever `jm.maps` changes and
   * drags the DM back to the map in the URL every time they pick a
   * different one, which is maddening and very hard to attribute.
   */
  const [searchParams] = useSearchParams();
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    const campaign = searchParams.get('campaign');
    const map = searchParams.get('map');
    if (!campaign) return;
    deepLinked.current = true;
    (async () => {
      const list = await jm.selectCampaign(parseInt(campaign, 10));
      // selectCampaign loads the maps; selectMap needs that list, because it
      // reads the map's scope out of it.
      if (map) jm.selectMap(parseInt(map, 10), list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const { toast } = useToast();
  const confirm = useConfirm();

  const [placeLocId, setPlaceLocId] = useState('');
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [naming, setNaming] = useState(null);     // { path, newLocs } | null
  const [distEdit, setDistEdit] = useState(null);  // { fromId, toId, ... } | null
  const [matrixOpen, setMatrixOpen] = useState(false);
  /**
   * Which side panel is showing on a narrow screen.
   *
   * Above `lg` both are always visible and this is ignored. Below it they
   * become overlay drawers, because the two of them are 520px of fixed chrome
   * — on a 390px phone the map column collapsed to nothing and the page
   * overflowed sideways. One at a time: they would otherwise cover the map
   * entirely, which is the thing you came to look at.
   */
  const [drawer, setDrawer] = useState(null);   // 'tools' | 'details' | null
  const [wpEventCtx, setWpEventCtx] = useState(null); // { pathId, wpIdx } | null
  const [selectedSection, setSelectedSection] = useState(null); // { pathId, index } | null
  const [drawMode, setDrawMode] = useState('route'); // Draw is routes-only now (movement paths are derived)
  const [roadType, setRoadType] = useState('road'); // 'road' | 'flight' | 'maritime'
  const [showRoutes, setShowRoutes] = useState(true); // toggle road-line visibility
  const [hiddenPaths, setHiddenPaths] = useState(() => new Set()); // per-path declutter (view-only)
  const toggleHidePath = (id) => setHiddenPaths((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [editRegionId, setEditRegionId] = useState(null); // region unlocked for move/reshape
  const viewport = useMapViewport();
  const interaction = useMapInteraction(viewport, jm, { placeLocId, onOpenNaming: setNaming, drawMode, roadType, editRegionId });

  // Regions are locked by default — any change of selection re-locks them.
  useEffect(() => { setEditRegionId(null); }, [jm.selectedLoc]);

  // Selecting a location from the sidebar list also FOCUSES the map on its pin
  // (centre + zoom-in). Map-pin clicks keep going through jm.selectLocation directly
  // so dragging a pin isn't disrupted by a recenter.
  function focusLocation(id) {
    jm.selectLocation(id);
    const loc = jm.placedLocs.find((l) => sameId(l.id, id));
    if (loc) viewport.centerOn(loc.x, loc.y);
  }

  // Selecting a route section: ensure its route is selected, then highlight the
  // section so the Details panel focuses its distance input.
  function selectSection(pathId, index) {
    jm.selectPath(pathId);
    setSelectedSection({ pathId, index });
  }

  function editDistance(fromId, toId) {
    const from = jm.placedLocs.find((l) => sameId(l.id, fromId));
    const to = jm.placedLocs.find((l) => sameId(l.id, toId));
    setDistEdit({ fromId, toId, fromName: from?.name, toName: to?.name, existing: distanceBetween(fromId, toId, jm.routeDistances) });
  }

  // "Pin selected location" → choose the right tool for its type.
  function placeSelected() {
    const id = parseInt(placeLocId);
    if (!id) { toast('Select a location from the dropdown first', 'error'); return; }
    if (!jm.mapId) { toast('Select a map first', 'error'); return; }
    const campLoc = jm.campaignLocs.find((l) => sameId(l.id, id));
    const isRegionType = campLoc && REGION_SIZE_TYPES.includes(campLoc.size_type);
    jm.setActiveTool(isRegionType ? 'region' : 'place');
    toast(isRegionType
      ? 'Click on the map to draw the region boundary (Region tool active)'
      : 'Click on the map to place this location (Place tool active)');
  }

  async function handleShare() {
    try {
      setShareUrl(await jm.shareMap());
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleDeleteMap() {
    if (await confirm('Delete this journey map and all its data?', { title: 'Delete map', confirmLabel: 'Delete' })) jm.deleteMap();
  }

  return (
    <>
      <AppHeader icon="🗺️" name="Journey Path Map">
        <Select value={jm.campaignId ?? ''} onChange={(e) => jm.selectCampaign(e.target.value || null)}>
          <option value="">— Campaign —</option>
          {[...jm.campaigns].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>

        <Select value={jm.mapId ?? ''} onChange={(e) => jm.selectMap(e.target.value || null)} disabled={!jm.campaignId}>
          <option value="">— Select Map —</option>
          {[...jm.maps].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>

        <Button variant="accent" onClick={() => setNewMapOpen(true)} disabled={!jm.campaignId}>+ New Map</Button>

        {jm.mapId && (
          <>
            <Button onClick={handleShare}>🔗 Share</Button>
            <Button onClick={jm.exportMap}>⬇ Export</Button>
            <Button variant="danger" onClick={handleDeleteMap}>🗑</Button>
          </>
        )}
      </AppHeader>

      {/* Drawer toggles — only rendered below lg, where the panels are overlays. */}
      <div className="lg:hidden flex gap-2 px-2 py-1 border-b border-border bg-surface2 flex-shrink-0">
        <Button variant={drawer === 'tools' ? 'accent' : 'default'} className="text-[0.65rem] px-2 py-0.5"
          onClick={() => setDrawer((d) => (d === 'tools' ? null : 'tools'))}>🧰 Tools</Button>
        <Button variant={drawer === 'details' ? 'accent' : 'default'} className="text-[0.65rem] px-2 py-0.5"
          onClick={() => setDrawer((d) => (d === 'details' ? null : 'details'))}>ℹ️ Details</Button>
        {drawer && (
          <button type="button" className="ml-auto text-[0.7rem] text-text-muted hover:text-gold"
            onClick={() => setDrawer(null)}>Close ✕</button>
        )}
      </div>

      {/*
        Three fixed columns above lg, a single map column below it with the two
        panels as overlays. `[grid-template-columns:…]` rather than the old
        inline style, because an inline style cannot carry a breakpoint.
      */}
      <div className="flex-1 grid overflow-hidden min-h-0 relative grid-cols-1 lg:[grid-template-columns:248px_1fr_272px]">
        <div className={[
          // Below lg: an absolutely-positioned drawer over the map, so opening
          // it does not resize the stage (which would trigger a re-fit and
          // move the map under the user's finger).
          'min-h-0 overflow-hidden',
          'max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:w-[min(18rem,85vw)] max-lg:shadow-card',
          drawer === 'tools' ? 'max-lg:block' : 'max-lg:hidden',
        ].join(' ')}>
        <Sidebar
          activeTool={jm.activeTool}
          onSetTool={jm.setActiveTool}
          drawMode={drawMode}
          onSetDrawMode={setDrawMode}
          roadType={roadType}
          onSetRoadType={setRoadType}
          showRoutes={showRoutes}
          onToggleRoutes={() => setShowRoutes((v) => !v)}
          mapId={jm.mapId}
          mapImage={jm.mapImage}
          onUploadImage={jm.uploadImage}
          onClearImage={jm.clearImage}
          campaignLocs={jm.campaignLocs}
          placedLocs={jm.placedLocs}
          scope={jm.scope}
          placeLocId={placeLocId}
          onPlaceLocChange={setPlaceLocId}
          onPlaceSelected={placeSelected}
          selectedLoc={jm.selectedLoc}
          onSelectLocation={focusLocation}
          onDeletePlacedLoc={async (id) => { if (await confirm('Remove this location from the map?', { title: 'Remove location', confirmLabel: 'Remove' })) jm.deletePlacedLoc(id); }}
          paths={jm.paths}
          selectedPath={jm.selectedPath}
          onSelectPath={jm.selectPath}
          onDeletePath={async (id) => { if (await confirm('Delete this route?', { title: 'Delete route', confirmLabel: 'Delete' })) jm.deletePath(id); }}
          hiddenPaths={hiddenPaths}
          onToggleHidePath={toggleHidePath}
          onOpenMatrix={() => setMatrixOpen(true)}
        />
        </div>

        <MapStage
          viewport={viewport}
          interaction={interaction}
          cursorClass={TOOL_CURSORS[jm.activeTool]}
          imageSrc={jm.mapImage || null}
          emptyMessage={jm.mapId ? 'Upload a map image to begin' : 'Select or create a journey map'}
          overlay={
            jm.activeTool === 'measure'
              ? <MeasurePanel measurePts={interaction.measurePts} placedLocs={jm.placedLocs} distances={jm.routeDistances} onClear={interaction.clearMeasure} />
              /* A Finish button while a path or region is in progress. Without
                 it the only ways to complete one are Enter and double-click —
                 neither of which a tablet has: no keyboard, and double-tap
                 collides with the browser's own zoom. Shown on every device,
                 because it is clearer than the double-click it replaces. */
              : (interaction.draw || interaction.region)
                ? (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 bg-surface border border-[var(--gold-dim)] rounded-sm shadow-card px-2 py-1.5">
                    <span className="text-[0.7rem] text-text-dim self-center">
                      {interaction.draw ? 'Drawing a route' : 'Drawing a region'}
                    </span>
                    <Button variant="accent" className="text-[0.65rem] px-2 py-0.5"
                      onClick={() => (interaction.draw ? interaction.finishPath() : interaction.finishRegion())}>
                      ✓ Finish
                    </Button>
                    <Button variant="default" className="text-[0.65rem] px-2 py-0.5"
                      onClick={() => jm.setActiveTool('select')}>
                      Cancel
                    </Button>
                  </div>
                )
                : null}
        >
          {({ iw, ih }) => (
            <>
              {/* Layer order (bottom → top): regions, then routes/paths, then pins —
                  so clicking a route/path/pin never grabs the region underneath. */}
              <EditorRegions locations={jm.placedLocs} iw={iw} ih={ih} selLoc={jm.selectedLoc} editId={editRegionId} onRegionDown={interaction.onRegionDown} onVertexDown={interaction.onVertexDown} />
              <EditorPaths paths={jm.paths} iw={iw} ih={ih} selPath={jm.selectedPath} selectedSection={selectedSection} distances={jm.routeDistances} placedLocs={jm.placedLocs} showRoutes={showRoutes} hiddenPaths={hiddenPaths} activeTool={jm.activeTool} onPathDown={interaction.onPathDown} onWaypointDown={interaction.onWaypointDown} onSectionClick={selectSection} onCurveDown={interaction.onCurveDown} onSectionAddCurve={interaction.onSectionAddCurve} onRemoveCurvePoint={jm.removeSectionCurvePoint} onLabelDown={interaction.onLabelDown} />
              <EditorPins locations={jm.placedLocs} iw={iw} ih={ih} selLoc={jm.selectedLoc} onPinDown={interaction.onPinDown} typeImages={jm.typeImages} />
              <DrawPreview draw={interaction.draw} cursor={interaction.cursor} iw={iw} ih={ih} />
              <RegionPreview region={interaction.region} cursor={interaction.cursor} iw={iw} ih={ih} />
              <MeasureOverlay measurePts={interaction.measurePts} placedLocs={jm.placedLocs} iw={iw} ih={ih} />
            </>
          )}
        </MapStage>

        <div className={[
          'min-h-0 overflow-hidden',
          'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:w-[min(20rem,85vw)] max-lg:shadow-card',
          drawer === 'details' ? 'max-lg:block' : 'max-lg:hidden',
        ].join(' ')}>
        <DetailsPanel
          selectedLoc={jm.selectedLoc}
          selectedPath={jm.selectedPath}
          placedLocs={jm.placedLocs}
          paths={jm.paths}
          distances={jm.routeDistances}
          maps={jm.maps}
          mapId={jm.mapId}
          selectedSection={selectedSection}
          onSetSectionDistance={jm.setRouteSectionDistance}
          onDeleteWaypoint={jm.deleteRouteWaypoint}
          regionEditing={sameId(editRegionId, jm.selectedLoc)}
          onToggleRegionEdit={() => setEditRegionId((cur) => (sameId(cur, jm.selectedLoc) ? null : jm.selectedLoc))}
          onEditDistance={editDistance}
          onSaveLinkedMap={jm.saveLocLinkedMap}
          onSetIconScale={jm.setLocIconScale}
          onSaveNotes={jm.savePathField}
          onLinkEvent={(pathId, wpIdx) => setWpEventCtx({ pathId, wpIdx })}
          onUnlinkEvent={jm.unlinkWaypointEvent}
        />
        </div>
      </div>

      <NewMapModal
        open={newMapOpen}
        onClose={() => setNewMapOpen(false)}
        onCreate={jm.createMap}
        campaignLocs={jm.campaignLocs}
      />
      <ShareModal open={shareUrl != null} onClose={() => setShareUrl(null)} url={shareUrl} />
      <NamingModal data={naming} onClose={() => setNaming(null)} onSave={jm.saveNaming} />
      <DistanceMatrixModal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        placedLocs={jm.placedLocs}
        distances={jm.routeDistances}
        scope={jm.scope}
        onEditDistance={editDistance}
      />
      <WaypointEventModal ctx={wpEventCtx} jm={jm} onClose={() => setWpEventCtx(null)} />
      {/* Rendered last so it stacks above the matrix when both are open. */}
      <DistanceModal edit={distEdit} onClose={() => setDistEdit(null)} onSave={jm.saveDistance} />
    </>
  );
}
