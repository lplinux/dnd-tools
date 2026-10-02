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

import { useEffect, useState } from 'react';

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
  const { toast } = useToast();
  const confirm = useConfirm();

  const [placeLocId, setPlaceLocId] = useState('');
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [naming, setNaming] = useState(null);     // { path, newLocs } | null
  const [distEdit, setDistEdit] = useState(null);  // { fromId, toId, ... } | null
  const [matrixOpen, setMatrixOpen] = useState(false);
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

      <div className="flex-1 grid overflow-hidden min-h-0" style={{ gridTemplateColumns: '248px 1fr 272px' }}>
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

        <MapStage
          viewport={viewport}
          interaction={interaction}
          cursorClass={TOOL_CURSORS[jm.activeTool]}
          imageSrc={jm.mapImage || null}
          emptyMessage={jm.mapId ? 'Upload a map image to begin' : 'Select or create a journey map'}
          overlay={jm.activeTool === 'measure'
            ? <MeasurePanel measurePts={interaction.measurePts} placedLocs={jm.placedLocs} distances={jm.routeDistances} onClear={interaction.clearMeasure} />
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
