/**
 * pages/PcSheet/tabs/index.jsx
 *
 * All six tab content components for the PC Character Sheet:
 *   CharacterTab  — name, portrait, story, traits, flaws, goals
 *   StatsTab      — embedded NpcSheet iframe bridge
 *   RelationsTab  — relationship list + SVG graph + add/edit modal
 *   PublicInfoTab — public info textarea
 *   PrivateTab    — private info textarea (player + DM)
 *   DmNotesTab    — DM-only notes (add, toggle visibility, delete)
 */

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Button, FormField }   from '@/components/ui';
import { useConfirm }          from '@/contexts/ConfirmContext';
import PortraitBox             from '../components/PortraitBox';
import RelationModal           from '../components/RelationModal';
import RelGraph                from '../components/RelGraph';

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────
const TA_CLS    = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm font-body resize-y focus:outline-none focus:border-[var(--gold-dim)]';
const INPUT_CLS = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

function Card({ title, children }) {
  return (
    <div className="bg-surface2 border border-border rounded-sm">
      <div className="px-4 py-2 border-b border-border font-display text-gold text-xs uppercase tracking-widest">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SaveRow({ onSave, saving }) {
  return (
    <div className="flex justify-end pt-2">
      <Button variant="accent" loading={saving} onClick={onSave}>💾 Save</Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CharacterTab
// ─────────────────────────────────────────────────────────────────────────────
export function CharacterTab({ charData, playerId, actions, publicLink }) {
  const [form, setForm] = useState({
    name: '', story: '', traits: '', flaws: '', goals: '',
    picture_url: '', picture_data: null,
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync charData → form whenever it changes
  useEffect(() => {
    if (!charData) return;
    setForm({
      name:         charData.name         || '',
      story:        charData.story        || '',
      traits:       charData.traits       || '',
      flaws:        charData.flaws        || '',
      goals:        charData.goals        || '',
      picture_url:  charData.picture_url  || '',
      picture_data: charData.picture_data || null,
    });
  }, [charData]);

  const ff = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    try {
      await actions.saveCharacter('character', {
        name:        form.name,
        story:       form.story,
        traits:      form.traits,
        flaws:       form.flaws,
        goals:       form.goals,
        picture_url: form.picture_url,
        picture_data:form.picture_data,
      });
    } finally { setSaving(false); }
  }

  async function copyLink() {
    const link = await actions.getPublicLink();
    if (link) {
      navigator.clipboard.writeText(link).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-4">
      {/* Name + portrait */}
      <Card title="👤 Identity">
        <div className="flex flex-col gap-3">
          <FormField label="Character Name">
            <input type="text" value={form.name} onChange={ff('name')}
              placeholder="Character Name…" className={INPUT_CLS} />
          </FormField>

          <PortraitBox
            charData={{ ...charData, ...form }}
            playerId={playerId}
            onUpload={async file => {
              const dataUrl = await actions.uploadPortrait(file);
              setForm(p => ({ ...p, picture_data: dataUrl, picture_url: '' }));
            }}
            onUrlChange={url => setForm(p => ({ ...p, picture_url: url, picture_data: null }))}
            onClear={() => setForm(p => ({ ...p, picture_url: '', picture_data: null }))}
          />

          {/* Public link */}
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <span className="text-text-dim text-xs font-display uppercase tracking-wider">
              🔗 Public link:
            </span>
            <Button variant="default" onClick={copyLink} className="text-xs">
              {copied ? '✓ Copied!' : 'Copy Link'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Story */}
      <Card title="📖 Story &amp; Background">
        <FormField label="Story / Background">
          <textarea value={form.story} onChange={ff('story')} rows={5}
            placeholder="Your character's origin and history…" className={TA_CLS} />
        </FormField>
      </Card>

      {/* Traits */}
      <Card title="🎭 Traits, Flaws &amp; Goals">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Personality Traits">
            <textarea value={form.traits} onChange={ff('traits')} rows={3}
              placeholder="Personality traits…" className={TA_CLS} />
          </FormField>
          <FormField label="Flaws">
            <textarea value={form.flaws} onChange={ff('flaws')} rows={3}
              placeholder="Flaws and weaknesses…" className={TA_CLS} />
          </FormField>
        </div>
        <FormField label="Goals &amp; Motivations" className="mt-3">
          <textarea value={form.goals} onChange={ff('goals')} rows={3}
            placeholder="What drives your character…" className={TA_CLS} />
        </FormField>
      </Card>

      <SaveRow onSave={handleSave} saving={saving} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsTab — NpcSheet embedded via iframe + postMessage bridge
// ─────────────────────────────────────────────────────────────────────────────
export function StatsTab({ playerId, charData, onSaveStats }) {
  const confirm = useConfirm();
  const iframeRef = useRef(null);
  const [ready, setReady]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  // Height of the embedded sheet, driven by its own IFRAME_RESIZE message.
  // Without this the iframe sat at a fixed 900px, and since an iframe prints
  // only its own box, everything past ~one viewport was missing from the PDF.
  const [frameH, setFrameH] = useState(900);

  // Listen for messages from the embedded NpcSheet
  useEffect(() => {
    function onMessage(e) {
      if (!e.data || typeof e.data !== 'object') return;
      // Only listen to OUR iframe. While printing there are two StatsTab
      // instances mounted (the on-screen one and the print copy), and without
      // this each reacted to the other's frame — the print copy's NPC_READY
      // made the on-screen one re-push LOAD_STATS over unsaved edits.
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data.type === 'IFRAME_RESIZE' && Number.isFinite(e.data.height)) {
        setFrameH(Math.max(400, Math.ceil(e.data.height)));
      }
      if (e.data.type === 'NPC_READY') {
        setReady(true);
        // Push stats data into the iframe
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'LOAD_STATS', payload: charData?.stats ?? {} }, '*'
        );
      }
      if (e.data.type === 'STATS_DATA') {
        onSaveStats(e.data.payload).then(() => {
          setSaving(false);
          setMsg('✓ Stats saved!');
          setTimeout(() => setMsg(''), 2500);
        }).catch(err => {
          setSaving(false);
          setMsg('✗ ' + err.message);
        });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [charData, onSaveStats]);

  // NPC_READY fires once, when the iframe mounts. If the stats arrive after that
  // (the usual case — loadSheet is still in flight), nothing would ever push them,
  // so re-send whenever they change while the frame is ready.
  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'LOAD_STATS', payload: charData?.stats ?? {} }, '*'
    );
  }, [ready, charData?.stats]);

  function handleSave() {
    if (!ready) return;
    setSaving(true);
    iframeRef.current?.contentWindow?.postMessage({ type: 'COLLECT_STATS' }, '*');
  }

  /**
   * Print the stat block alone, by printing the iframe's OWN document.
   *
   * That keeps the parchment design: the embedded sheet carries the stylesheet
   * it was built with, including its print rules — which now swap each textarea
   * for a plain text mirror, drop empty fields and keep labels with their boxes.
   * Rendering it as a plain document instead was tried and looked worse; the
   * parchment is the point.
   */
  function handlePrintStats() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  async function handleClear() {
    if (!await confirm('Clear the stats sheet?', { title: 'Clear stats', confirmLabel: 'Clear' })) return;
    // Not LOAD_STATS with an empty payload: populateSheet bails on `{}` (it has
    // to, or an empty save would wipe a sheet), so that was a silent no-op.
    // CLEAR_STATS calls the sheet's own clearSheet() instead.
    iframeRef.current?.contentWindow?.postMessage({ type: 'CLEAR_STATS' }, '*');
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-surface2 border-b border-border flex-shrink-0">
        <span className="text-text-dim text-xs flex-1">{msg}</span>
        <Button variant="accent"  loading={saving} onClick={handleSave} disabled={!ready}>
          💾 Save Stats
        </Button>
        <Button variant="default" onClick={handlePrintStats} disabled={!ready}>
          🖨 Print
        </Button>
        <Button variant="danger" onClick={handleClear} disabled={!ready}>
          🗑 Clear
        </Button>
      </div>

      {/* NpcSheet iframe.
          min-h-full on the frame, not just a pixel height: a short sheet left
          the rest of the scroll container showing the app's dark background as
          a black band under the parchment. The frame now always fills at least
          the visible area, and still grows past it via frameH when the sheet is
          taller. The wrapper carries the parchment colour too, so the band can
          never come back during the frame's own reflow. */}
      <div className="flex-1 overflow-y-auto bg-[#f7f0dc]">
        <iframe
          ref={iframeRef}
          src={`/npc-sheet?embedded=1&player=${playerId}`}
          title="Stats Sheet"
          className="w-full border-0 block"
          style={{ height: frameH, minHeight: '100%' }}
          scrolling="no"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RelationsTab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cross-connection bubbles: DM links between this character's entities and other
 * players/NPCs, grouped by the external entity (so one NPC linked to two of my
 * relations collapses into a single bubble). Returns null when there are none.
 */
function renderCrossConnections({ crossConnections, relationships, playerId }) {
  if (!crossConnections.length) return null;
  const myRelIds = new Set(relationships.map((r) => Number(r.id)));
  const myPlayer = Number(playerId);
  const isMine = (type, id) =>
    (type === 'relationship' ? myRelIds.has(Number(id)) : type === 'player' ? Number(id) === myPlayer : false);
  const label = (c, side) => {
    const type = c[`${side}_entity_type`];
    const id = c[`${side}_entity_id`];
    if (type === 'relationship') {
      const name = c[`${side}_rel_name`];
      const pl = c[`${side}_player_name`];
      if (!name) return `Rel #${id}`;
      return myRelIds.has(Number(id)) ? name : `[${pl || '?'}] ${name}`;
    }
    if (type === 'player') return c[`${side}_entity_player_name`] || `Player #${id}`;
    if (type === 'npc') return `🎭 ${c[`${side}_npc_name`] || `NPC #${id}`}`;
    return `#${id}`;
  };
  const seen = new Set();
  const groups = new Map();
  for (const c of crossConnections) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const fromMine = isMine(c.from_entity_type, c.from_entity_id);
    const toMine = isMine(c.to_entity_type, c.to_entity_id);
    let extSide = 'from';
    let mySide = 'to';
    if (fromMine && !toMine) { extSide = 'to'; mySide = 'from'; }
    const extKey = `${c[`${extSide}_entity_type`]}:${c[`${extSide}_entity_id`]}`;
    if (!groups.has(extKey)) groups.set(extKey, { extLabel: label(c, extSide), items: [] });
    groups.get(extKey).items.push({
      label: c.label, myLabel: label(c, mySide), notes: c.notes || null,
      dmOnly: !c.is_public, extIsFrom: extSide === 'from',
    });
  }

  return (
    <div>
      <div className="text-[10px] font-display uppercase tracking-wider text-text-dim mb-1">🔗 Cross-connections</div>
      <div className="flex flex-wrap gap-2">
        {[...groups.values()].map(({ extLabel, items }, gi) => {
          const dmOnly = items.some((i) => i.dmOnly);
          return (
            <div key={gi} className={`inline-flex flex-wrap items-center gap-1 rounded-sm border border-dashed border-border2 bg-surface2 px-2 py-1 text-[12px] ${dmOnly ? 'opacity-65' : ''}`}>
              <span className="text-text-muted text-[10px]">🔗</span>
              <strong className="text-text">{extLabel}</strong>
              {items.map((i, ii) => (
                <span key={ii} className="text-[11px]">
                  {ii > 0 && <span className="text-border2 mx-1">·</span>}
                  {i.extIsFrom
                    ? <><span className="text-text-dim">⟶ {i.label} ⟶</span> <strong className="text-text">{i.myLabel}</strong></>
                    : <><strong className="text-text">{i.myLabel}</strong> <span className="text-text-dim">⟶ {i.label} ⟶</span></>}
                  {i.notes && <span className="text-text-muted italic text-[10px]"> ({i.notes})</span>}
                </span>
              ))}
              {dmOnly && <span className="text-[9px] text-text-muted bg-surface border border-border rounded-sm px-1" title="Hidden from player">🔒 DM only</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RelationsTab({ relationships: rawRelationships, crossConnections: rawCross, playerId, charName, isDM, actions }) {
  const confirm = useConfirm();
  // Guard against undefined during the initial render before data loads
  const relationships = rawRelationships ?? [];
  const crossConnections = rawCross ?? [];
  const [relModal, setRelModal] = useState(false);
  const [editRel,  setEditRel]  = useState(null);

  async function handleSave(form) {
    const payload = {
      name:          form.name,
      relation_type: form.relationType,
      status_label:  form.status   || null,
      link:          form.link     || null,
      parent_id:     form.parentId || null,
      is_dm_only:    form.dmOnly   || false,
    };
    if (editRel) {
      await actions.editRelationship(editRel.id, payload);
    } else {
      await actions.addRelationship(payload);
    }
    setRelModal(false);
    setEditRel(null);
  }

  function openEdit(rel) {
    setEditRel(rel);
    setRelModal(true);
  }

  // Determine link type for display icon
  function linkIcon(link) {
    if (!link) return null;
    if (link.startsWith('http')) return '🔗';
    return '📝';
  }

  async function del(rel) {
    if (await confirm(`Delete "${rel.name}"?`, { title: 'Delete relationship', confirmLabel: 'Delete' })) actions.deleteRelationship(rel.id);
  }

  // One compact chip for a relationship (condensed matrix view).
  function Chip({ rel, isChild }) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-sm border bg-surface2 px-2 py-1 text-[12px] ${rel.is_dm_only ? 'border-dashed border-border2 opacity-75' : 'border-border'}`}
        style={isChild ? { marginLeft: 16 } : undefined}
      >
        {isChild && <span className="text-text-muted text-[10px]">↳</span>}
        <strong className="text-text">{rel.name}</strong>
        {rel.is_dm_only && <span className="text-[9px] text-text-muted bg-surface border border-border rounded-sm px-1" title="Hidden from player">🔒 DM only</span>}
        {rel.status_label && <span className="text-[9px] text-text-dim bg-white/5 rounded-sm px-1">{rel.status_label}</span>}
        {rel.link && (
          <a href={rel.link.startsWith('http') ? rel.link : undefined} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-gold" title={rel.link}>{linkIcon(rel.link)}</a>
        )}
        {isDM && (
          <button onClick={() => actions.toggleRelVisibility(rel.id)} title={rel.is_dm_only ? 'Show to player' : 'Hide from player'}
            className="text-text-muted hover:text-gold px-0.5 text-[11px]">{rel.is_dm_only ? <EyeOff size={11}/> : <Eye size={11}/>}</button>
        )}
        <button onClick={() => openEdit(rel)} title="Edit"
          className="rounded-sm bg-[var(--gold-dim)] text-bg px-1.5 py-0.5 text-[10px]">✏️</button>
        <button onClick={() => del(rel)} title="Delete"
          className="rounded-sm bg-danger text-text px-1.5 py-0.5 text-[11px] leading-none">×</button>
      </div>
    );
  }

  // ── Group top-level relationships by type; children render nested (↳). ──
  const ORDER = ['Grandparent', 'Parent', 'Sibling', 'Child', 'Grandchild', 'Mentor', 'Ally', 'Friend', 'Other', 'Rival', 'Enemy'];
  const TYPE_ICON = {
    Grandparent: '🧓', Parent: '👨‍👩‍👧', Sibling: '👫', Child: '👶', Grandchild: '🌱',
    Mentor: '🎓', Friend: '🤝', Ally: '🛡️', Rival: '🗡️', Enemy: '⚔️', Other: '👤',
  };
  const childrenOf = {};
  relationships.forEach((r) => { if (r.parent_id != null) (childrenOf[r.parent_id] ||= []).push(r); });
  const rank = (t) => (ORDER.indexOf(t) === -1 ? 99 : ORDER.indexOf(t));
  const topLevel = relationships.filter((r) => r.parent_id == null)
    .sort((a, b) => rank(a.relation_type) - rank(b.relation_type) || (a.name || '').localeCompare(b.name || ''));
  const groups = {};
  topLevel.forEach((r) => { (groups[r.relation_type || 'Other'] ||= []).push(r); });

  const cross = renderCrossConnections({ crossConnections, relationships, playerId });

  return (
    <div className="space-y-4">
      <Card title="🌳 Family Tree &amp; Relationship Matrix">
        {(!relationships.length && !crossConnections.length) ? (
          <p className="text-text-dim italic text-sm py-2 text-center">No relations yet — add some below.</p>
        ) : (
          /* One line. The list used to stack a row per relation type and take up
             to 42vh, pushing the graph — the thing you actually read — below the
             fold. Everything now flows in a single strip that scrolls sideways,
             with each type's label inline as a separator rather than a heading. */
          <div className="mb-3">
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-2">
              {Object.entries(groups).map(([type, rels], gi, arr) => (
                <div key={type} className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-display uppercase tracking-wider text-text-dim flex-shrink-0">
                    {TYPE_ICON[type] || '👤'} {type}
                  </span>
                  {rels.flatMap((r) => [
                    <Chip key={r.id} rel={r} />,
                    ...(childrenOf[r.id] || []).map((c) => <Chip key={c.id} rel={c} isChild />),
                  ])}
                  {gi < arr.length - 1 && <span className="text-border2 flex-shrink-0">|</span>}
                </div>
              ))}
            </div>
            {cross}
          </div>
        )}

        {/* Above the graph, so adding a relation doesn't mean scrolling past it. */}
        <div className="flex justify-end mb-3">
          <Button variant="accent" onClick={() => { setEditRel(null); setRelModal(true); }}>
            ➕ Add Relation
          </Button>
        </div>

        {/* SVG graph */}
        {(relationships.length > 0 || crossConnections.length > 0) && (
          <RelGraph
            relationships={relationships}
            crossConnections={crossConnections}
            playerId={playerId}
            charName={charName}
            onEditRelation={openEdit}
          />
        )}
      </Card>

      <RelationModal
        open={relModal}
        onClose={() => { setRelModal(false); setEditRel(null); }}
        onSave={handleSave}
        editData={editRel}
        allRelations={relationships}
        isDM={isDM}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PublicInfoTab
// ─────────────────────────────────────────────────────────────────────────────
export function PublicInfoTab({ charData, actions }) {
  const [text,   setText]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(charData?.public_info || ''); }, [charData]);

  async function handleSave() {
    setSaving(true);
    try { await actions.saveCharacter('public', { public_info: text }); }
    finally { setSaving(false); }
  }

  return (
    <Card title="📢 Public Information">
      <p className="text-text-dim text-xs mb-3 italic">Visible to all players in the campaign.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={12}
        placeholder="Information other players can see about your character…"
        className={TA_CLS} />
      <SaveRow onSave={handleSave} saving={saving} />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PrivateTab
// ─────────────────────────────────────────────────────────────────────────────
export function PrivateTab({ charData, actions }) {
  const [text,   setText]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(charData?.private_info || ''); }, [charData]);

  async function handleSave() {
    setSaving(true);
    try { await actions.saveCharacter('private', { private_info: text }); }
    finally { setSaving(false); }
  }

  return (
    <Card title="🔒 Private Information">
      <p className="text-text-dim text-xs mb-3 italic">Only you and the DM can see this.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={12}
        placeholder="Secrets, private thoughts, hidden goals…"
        className={TA_CLS} />
      <SaveRow onSave={handleSave} saving={saving} />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DmNotesTab
// ─────────────────────────────────────────────────────────────────────────────
export function DmNotesTab({ notes: rawNotes, isDM = true, actions }) {
  const confirm = useConfirm();
  const notes = rawNotes ?? [];
  const [content,  setContent]  = useState('');
  const [dmVisible, setDmVisible] = useState(false);
  const [adding,   setAdding]   = useState(false);

  async function handleAdd() {
    if (!content.trim()) return;
    setAdding(true);
    try {
      await actions.addDmNote(content.trim(), dmVisible);
      setContent('');
      setDmVisible(false);
    } finally { setAdding(false); }
  }

  return (
    <div className="space-y-4">
      {/* A player reaches this tab only when the DM has shared a note, and then
          sees the shared ones read-only — no compose box, no visibility toggle,
          no delete. The API never sends them a hidden note in the first place. */}
      {!isDM && (
        <p className="text-text-dim text-xs italic">
          Notes your DM has chosen to share with you.
        </p>
      )}

      {/* Add note */}
      {isDM && (
      <Card title="➕ Add DM Note">
        <div className="flex flex-col gap-2">
          <FormField label="Content">
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
              placeholder="Note for this character…" className={TA_CLS} />
          </FormField>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
            <input type="checkbox" checked={dmVisible} onChange={e => setDmVisible(e.target.checked)}
              className="w-4 h-4 accent-[var(--gold)]" />
            <span>Immediately visible to player</span>
          </label>
          <div className="flex justify-end">
            <Button variant="accent" loading={adding} onClick={handleAdd}
              disabled={!content.trim()}>
              Add Note
            </Button>
          </div>
        </div>
      </Card>
      )}

      {/* Note cards — compact grid of small cards */}
      {!notes.length ? (
        <p className="text-text-dim italic text-sm text-center py-6">
          {isDM ? 'No DM notes yet.' : 'Your DM has not shared any notes with you yet.'}
        </p>
      ) : (
        <div
          className="grid gap-2.5 max-h-[45vh] overflow-y-auto pr-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {notes.map(note => (
            <div key={note.id}
              className={`bg-surface2 border rounded-sm p-2.5 ${note.dm_visible ? 'border-[var(--gold-dim)]' : 'border-border'}`}>
              <div className="text-[12px] leading-snug whitespace-pre-wrap text-text mb-1.5">{note.content}</div>
              {isDM && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-display tracking-wider rounded-sm px-1.5 py-0.5 ${note.dm_visible ? 'bg-[#2d3a1a] text-[#9fd49f]' : 'bg-[#3a1a1a] text-[#d49f9f]'}`}>
                    {note.dm_visible ? '👁 Visible' : '🙈 Hidden'}
                  </span>
                  <button onClick={() => actions.toggleNoteVisibility(note.id, !note.dm_visible)}
                    className="text-[10px] rounded-sm bg-surface3 border border-border2 text-text-dim hover:text-text px-1.5 py-0.5">
                    {note.dm_visible ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={async () => { if (await confirm('Delete this note?', { title: 'Delete note', confirmLabel: 'Delete' })) actions.deleteDmNote(note.id); }}
                    className="ml-auto text-[11px] leading-none rounded-sm bg-danger text-text px-1.5 py-0.5" title="Delete">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
