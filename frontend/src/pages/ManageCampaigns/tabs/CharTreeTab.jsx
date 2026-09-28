/**
 * pages/ManageCampaigns/tabs/CharTreeTab.jsx
 *
 * Character relationship tree — full faithful port of the vanilla drawTree.
 *
 * Layout algorithm (matches the legacy manage-campaigns.html exactly):
 *   1. One vertical column per player, spaced PLAYER_SPACING_X apart
 *   2. Family relationships placed in tiers above/below the player node
 *      (Grandparent=-2, Parent=-1, Sibling=0, Child=1, Grandchild=2)
 *   3. Social relationships fanned to the right of each column
 *   4. Child-of-relationship nodes orbit their parent relationship node
 *   5. Only NPCs that appear in at least one cross-connection are shown,
 *      placed below everything, sorted by weighted average X of their peers
 *   6. Global repulsion pass (400 iterations) prevents any two nodes overlapping
 *   7. Viewport scaled + centred on the bounding box
 *
 * Drawing (matches the legacy manage-campaigns.html drawTree):
 *   - Family tier bands + horizontal bars
 *   - Family edges (L-shaped), social edges (Bézier), child-of edges (dashed)
 *   - NPC separator line
 *   - DM cross-connection edges (dashed red/gold) with labels
 *   - Nodes (player=gold ring, npc=green ring, rel=coloured ring)
 *   - Relation-type micro label above family nodes
 *
 * Hover tooltip via a floating div overlay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Modal, FormField, Spinner } from '@/components/ui';
import { campaignsApi } from '@/api/campaigns';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { minCrossingOrder, median } from '@/components/graph/ordering';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants (world units, identical to the vanilla version)
// ─────────────────────────────────────────────────────────────────────────────
const TH              = 90;
const HS              = 82;
const NR              = 12;
const PR              = 16;
const SOC_R           = 110;
const SOC_ANG         = 55;
const PLAYER_SPACING_X = 420;
const CHILD_ORBIT     = NR * 3.2;
const MIN_GAP         = 26; // larger so node labels (wider than the dots) don't overlap

const FAMILY_TYPES    = new Set(['Grandparent','Parent','Sibling','Child','Grandchild']);
const TIER_MAP        = { Grandparent:-2, Parent:-1, Sibling:0, Child:1, Grandchild:2 };

// ─────────────────────────────────────────────────────────────────────────────
// Node colour palettes (theme-aware, read at draw time via getComputedStyle)
// ─────────────────────────────────────────────────────────────────────────────
const REL_FILL_DARK = {
  Grandparent:'#2e1a06',Parent:'#362206',Sibling:'#2c1e06',
  Child:'#1a2c08',Grandchild:'#162a06',
  Mentor:'#062c2c',Friend:'#062c1a',Ally:'#06202c',
  Rival:'#2c0628',Enemy:'#3c0808',Other:'#1a1a14',
};
const REL_RING_DARK = {
  Grandparent:'#a06020',Parent:'#b07828',Sibling:'#887020',
  Child:'#5a8028',Grandchild:'#488020',
  Mentor:'#288888',Friend:'#288858',Ally:'#286898',
  Rival:'#885888',Enemy:'#a85050',Other:'#605840',
};
const REL_TEXT_DARK = {
  Grandparent:'#e8c070',Parent:'#e8c070',Sibling:'#e0b860',
  Child:'#a0d858',Grandchild:'#90d050',
  Mentor:'#60d8d8',Friend:'#60d898',Ally:'#6098d8',
  Rival:'#d860d8',Enemy:'#d85868',Other:'#c0b888',
};
const REL_FILL_LIGHT = {
  Grandparent:'#d8cba0',Parent:'#d4c898',Sibling:'#ccc090',
  Child:'#b8d0a0',Grandchild:'#a8cc90',
  Mentor:'#90c8c8',Friend:'#90c8a8',Ally:'#90a8c8',
  Rival:'#c898c8',Enemy:'#c89898',Other:'#c0b890',
};
const REL_RING_LIGHT = {
  Grandparent:'#8b6010',Parent:'#a07018',Sibling:'#788010',
  Child:'#4a7018',Grandchild:'#387010',
  Mentor:'#187878',Friend:'#187848',Ally:'#185878',
  Rival:'#785078',Enemy:'#985040',Other:'#504830',
};
const REL_TEXT_LIGHT = {
  Grandparent:'#4a3000',Parent:'#4a3800',Sibling:'#3a3000',
  Child:'#284800',Grandchild:'#204400',
  Mentor:'#005050',Friend:'#005030',Ally:'#003050',
  Rival:'#500050',Enemy:'#600010',Other:'#302810',
};

// ─────────────────────────────────────────────────────────────────────────────
// Build node map (pure function — no DOM side effects)
// ─────────────────────────────────────────────────────────────────────────────
function buildNodes(players, relationships, npcs, crossConns) {
  const nodes = {};

  // Which NPC ids appear in any cross-connection?
  const connectedNpcIds = new Set();
  crossConns.forEach(c => {
    if (c.from_entity_type === 'npc') connectedNpcIds.add(c.from_entity_id);
    if (c.to_entity_type   === 'npc') connectedNpcIds.add(c.to_entity_id);
  });

  // Order the player columns so players linked by DM cross-connections sit next
  // to each other — this removes most of the long crossing edges. Each cross
  // connection endpoint resolves to its owning player (player → itself,
  // relationship → its player_id, NPC → none); affinity edges are the resulting
  // player↔player pairs. minCrossingOrder never returns a worse order than input.
  const playerIdOf = (type, id) => {
    if (type === 'player') return id;
    if (type === 'npc') return null;
    return relationships.find((r) => r.id === id)?.player_id ?? null;
  };
  const playerEdges = [];
  crossConns.forEach((c) => {
    const a = playerIdOf(c.from_entity_type, c.from_entity_id);
    const b = playerIdOf(c.to_entity_type, c.to_entity_id);
    if (a != null && b != null && a !== b) playerEdges.push([a, b]);
  });
  const order = minCrossingOrder(players.map((p) => p.player_id), playerEdges);
  const orderedPlayers = [
    ...order.map((pid) => players.find((p) => p.player_id === pid)).filter(Boolean),
    ...players.filter((p) => !order.includes(p.player_id)),
  ];

  const totalW = (players.length - 1) * PLAYER_SPACING_X;
  const startX = -totalW / 2;

  orderedPlayers.forEach((p, pi) => {
    const bandCX = startX + pi * PLAYER_SPACING_X;

    // Player node
    nodes[`p_${p.player_id}`] = {
      x: bandCX, y: 0,
      label: p.char_name || p.player_name,
      type: 'player', r: PR, bandCX,
      tooltip: `Player: ${p.player_name}${p.char_name ? '\nCharacter: ' + p.char_name : ''}`,
    };

    const pRels = relationships.filter(r => r.player_id === p.player_id);
    const family = pRels.filter(r => FAMILY_TYPES.has(r.relation_type) && !r.parent_id);
    const social = pRels.filter(r => !FAMILY_TYPES.has(r.relation_type) && !r.parent_id);

    // ── Family tiers ───────────────────────────────────────────────────
    const byTier = {};
    family.forEach(r => {
      const t = TIER_MAP[r.relation_type] ?? 0;
      if (!byTier[t]) byTier[t] = [];
      byTier[t].push(r);
    });

    Object.entries(byTier).forEach(([tierStr, tNodes]) => {
      const t = parseInt(tierStr);
      const wy = t * TH;
      if (t === 0) {
        // Siblings: alternate left/right
        tNodes.forEach((r, i) => {
          const sign = i % 2 === 0 ? -1 : 1;
          const dist = (Math.floor(i / 2) + 1) * HS;
          nodes[`r_${r.id}`] = {
            x: bandCX + sign * dist, y: wy,
            label: r.name, type: 'rel',
            relType: r.relation_type, isFamily: true, r: NR, bandCX,
            tooltip: `${r.name}\nType: ${r.relation_type}\n👨‍👩‍👧 Family\nPlayer: ${r.player_name}`,
          };
        });
      } else {
        const sx = bandCX - (tNodes.length - 1) * HS / 2;
        tNodes.forEach((r, i) => {
          nodes[`r_${r.id}`] = {
            x: sx + i * HS, y: wy,
            label: r.name, type: 'rel',
            relType: r.relation_type, isFamily: true, r: NR, bandCX,
            tooltip: `${r.name}\nType: ${r.relation_type}\n👨‍👩‍👧 Family\nPlayer: ${r.player_name}`,
          };
        });
      }
    });

    // ── Social fan (right side of column) ──────────────────────────────
    if (social.length > 0) {
      const colFam = Object.values(nodes).filter(n =>
        n.type === 'rel' && n.bandCX === bandCX && n.isFamily
      );
      const famMaxX  = colFam.length ? Math.max(...colFam.map(n => n.x)) : bandCX;
      const anchorX  = famMaxX + NR + 30;
      const halfAng  = SOC_ANG * (Math.PI / 180);
      const step     = social.length === 1 ? 0 : (2 * halfAng) / (social.length - 1);
      social.forEach((r, i) => {
        const angle = social.length === 1 ? 0 : -halfAng + i * step;
        nodes[`r_${r.id}`] = {
          x: anchorX + SOC_R * Math.cos(angle),
          y: SOC_R * Math.sin(angle),
          label: r.name, type: 'rel',
          relType: r.relation_type, isFamily: false, r: NR, bandCX,
          tooltip: `${r.name}\nType: ${r.relation_type || 'Other'}\nPlayer: ${r.player_name}`,
        };
      });
    }
  });

  // ── Child-of-relationship nodes ─────────────────────────────────────
  const childRels = relationships.filter(r => r.parent_id != null);
  const childrenByParent = {};
  childRels.forEach(r => {
    if (!childrenByParent[r.parent_id]) childrenByParent[r.parent_id] = [];
    childrenByParent[r.parent_id].push(r);
  });
  Object.entries(childrenByParent).forEach(([pid, children]) => {
    const parentNode = nodes[`r_${pid}`];
    if (!parentNode) return;
    const playerX  = parentNode.bandCX ?? 0;
    const baseAngle = Math.atan2(parentNode.y, parentNode.x - playerX);
    const spread   = Math.PI / 4;
    const step     = children.length === 1 ? 0 : spread / (children.length - 1);
    children.forEach((r, i) => {
      const angle = children.length === 1
        ? baseAngle
        : baseAngle - spread / 2 + i * step;
      nodes[`r_${r.id}`] = {
        x: parentNode.x + CHILD_ORBIT * Math.cos(angle),
        y: parentNode.y + CHILD_ORBIT * Math.sin(angle),
        label: r.name, type: 'rel',
        relType: r.relation_type,
        isFamily: FAMILY_TYPES.has(r.relation_type),
        r: NR, bandCX: parentNode.bandCX,
        tooltip: `${r.name}\nType: ${r.relation_type || 'Other'}\nPlayer: ${r.player_name}`,
      };
    });
  });

  // ── NPC nodes (only those in cross-connections) ─────────────────────
  const connectedNpcs = npcs.filter(n => connectedNpcIds.has(n.id));
  if (connectedNpcs.length) {
    const allYs  = Object.values(nodes).map(n => n.y);
    const bottomY = allYs.length ? Math.max(...allYs) : 0;
    const npcY   = bottomY + TH + 60;

    // Order NPCs by the MEDIAN x of the nodes they connect to. Against a fixed
    // upper layer the median heuristic minimises crossings of the NPC edges
    // better than the mean (less skew from one far-off peer).
    const peerMedianX = (npc) => {
      const conns = crossConns.filter(c =>
        (c.from_entity_type === 'npc' && c.from_entity_id === npc.id) ||
        (c.to_entity_type   === 'npc' && c.to_entity_id   === npc.id)
      );
      if (!conns.length) return 0;
      const xs = conns.map(c => {
        const otherType = c.from_entity_type === 'npc' ? c.to_entity_type   : c.from_entity_type;
        const otherId   = c.from_entity_type === 'npc' ? c.to_entity_id     : c.from_entity_id;
        const prefix    = otherType === 'player' ? 'p' : otherType === 'npc' ? 'n' : 'r';
        return (nodes[`${prefix}_${otherId}`] || {}).x || 0;
      });
      return median(xs);
    };

    const sortedNpcs = [...connectedNpcs].sort((a, b) => peerMedianX(a) - peerMedianX(b));
    const spacing    = Math.max(2 * NR + 12, Math.min(100, 600 / Math.max(sortedNpcs.length, 1)));
    const totalNpcW  = spacing * (sortedNpcs.length - 1);

    sortedNpcs.forEach((n, ni) => {
      nodes[`n_${n.id}`] = {
        x: -totalNpcW / 2 + ni * spacing, y: npcY,
        label: n.name, type: 'npc', r: NR,
        tooltip: `NPC: ${n.name}`,
      };
    });
  }

  // ── Global repulsion (prevents overlap) ─────────────────────────────
  const keys = Object.keys(nodes);
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < keys.length; i++) {
      const ni    = nodes[keys[i]]; if (!ni) continue;
      const ri    = ni.r || NR;
      const fixed = ni.type === 'player';
      for (let j = i + 1; j < keys.length; j++) {
        const nj   = nodes[keys[j]]; if (!nj) continue;
        const rj   = nj.r || NR;
        const fjx  = nj.type === 'player';
        const minD = ri + rj + MIN_GAP;
        const dx   = (ni.x - nj.x) || 0.1;
        const dy   = (ni.y - nj.y) || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          const nx   = (dx / dist) * push;
          const ny   = (dy / dist) * push;
          if (!fixed) { ni.x += nx; ni.y += ny; }
          if (!fjx)   { nj.x -= nx; nj.y -= ny; }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return nodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute initial viewport to fit all nodes
// ─────────────────────────────────────────────────────────────────────────────
function fitViewport(nodes, W, H) {
  const vals = Object.values(nodes);
  if (!vals.length) return { scale: 1, ox: W / 2, oy: H / 2 };
  const xs = vals.map(n => n.x), ys = vals.map(n => n.y);
  const bbW   = Math.max(...xs) - Math.min(...xs) + 120;
  const bbH   = Math.max(...ys) - Math.min(...ys) + 120;
  const scale = Math.min(W / bbW, H / bbH, 1.2);
  const mx    = (Math.min(...xs) + Math.max(...xs)) / 2;
  const my    = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { scale, ox: W / 2 - mx * scale, oy: H / 2 - my * scale };
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw everything onto the canvas
// ─────────────────────────────────────────────────────────────────────────────
function drawAll(canvas, nodes, relationships, crossConns, vp) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!Object.keys(nodes).length) {
    ctx.font      = '13px Cinzel,serif';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#a09070';
    ctx.textAlign = 'center';
    ctx.fillText('Add players to see the character tree', W / 2, H / 2);
    return;
  }

  const cs  = getComputedStyle(document.documentElement);
  const get = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = theme === 'light';

  const C = {
    gold:    get('--gold',    '#c9a84c'),
    goldDim: get('--gold-dim','#7a6030'),
    textDim: get('--text-dim','#a09070'),
    border:  get('--border',  '#3d3220'),
    border2: get('--border2', '#554428'),
    red:     get('--red',     '#8b3a3a'),
    bg:      get('--bg',      '#13100b'),
  };

  const FILL = isLight ? REL_FILL_LIGHT : REL_FILL_DARK;
  const RING = isLight ? REL_RING_LIGHT : REL_RING_DARK;
  const TCOL = isLight ? REL_TEXT_LIGHT : REL_TEXT_DARK;

  function sx(x) { return x * vp.scale + vp.ox; }
  function sy(y) { return y * vp.scale + vp.oy; }
  const sc = vp.scale;

  // ── Family tier bands ─────────────────────────────────────────────────
  const tierGroups = {};
  Object.values(nodes).filter(n => n.isFamily).forEach(n => {
    const k = `${n.bandCX}_${n.y}`;
    if (!tierGroups[k]) tierGroups[k] = { y: n.y, nodes: [], cx: n.bandCX };
    tierGroups[k].nodes.push(n);
  });
  Object.values(tierGroups).forEach(({ y: wy, nodes: tns, cx }) => {
    if (tns.length < 2) return;
    const xs2 = tns.map(n => n.x);
    const hw   = (Math.max(...xs2) - Math.min(...xs2)) / 2 + NR + 8;
    ctx.fillStyle = `rgba(${isLight ? '180,155,80' : '30,20,5'},.18)`;
    ctx.beginPath();
    ctx.rect(sx(cx - hw), sy(wy - NR - 6), hw * 2 * sc, (2 * NR + 12) * sc);
    ctx.fill();
  });

  // ── Family tree edges (L-shaped lines) ───────────────────────────────
  ctx.setLineDash([]);
  Object.values(nodes).filter(n => n.isFamily && n.type === 'rel').forEach(n => {
    const px = `p_${Object.entries(nodes).find(([, pn]) => pn.type === 'player' && pn.bandCX === n.bandCX)?.[0]?.split('_')[1]}`;
    // Draw vertical line from player to tier level
    const playerNode = Object.values(nodes).find(p => p.type === 'player' && p.bandCX === n.bandCX);
    if (!playerNode) return;
    ctx.beginPath();
    ctx.moveTo(sx(n.x), sy(n.y));
    ctx.lineTo(sx(n.x), sy(0));
    ctx.strokeStyle = C.border2;
    ctx.lineWidth   = 0.8;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ── Social + child-of edges (Bézier) ─────────────────────────────────
  ctx.setLineDash([]);
  Object.values(nodes).filter(n => !n.isFamily && n.type === 'rel').forEach(n => {
    const playerNode = Object.values(nodes).find(p => p.type === 'player' && p.bandCX === n.bandCX);
    if (!playerNode) return;
    const x1 = sx(playerNode.x), y1 = sy(playerNode.y);
    const x2 = sx(n.x),          y2 = sy(n.y);
    const cpx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, y1, x2, y2);
    ctx.strokeStyle = RING[n.relType] || C.border2;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Child-of-relationship edges (dashed)
  relationships.filter(r => r.parent_id != null).forEach(r => {
    const child  = nodes[`r_${r.id}`];
    const parent = nodes[`r_${r.parent_id}`];
    if (!child || !parent) return;
    ctx.beginPath();
    ctx.moveTo(sx(parent.x), sy(parent.y));
    ctx.lineTo(sx(child.x),  sy(child.y));
    ctx.strokeStyle = RING[r.relation_type] || C.border2;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  });

  // ── NPC separator ─────────────────────────────────────────────────────
  const npcNodes = Object.values(nodes).filter(n => n.type === 'npc');
  if (npcNodes.length) {
    const minNpcY = Math.min(...npcNodes.map(n => n.y));
    const sepY    = sy(minNpcY - TH / 2);
    if (sepY > 0 && sepY < H) {
      ctx.beginPath();
      ctx.moveTo(20, sepY); ctx.lineTo(W - 20, sepY);
      ctx.strokeStyle = C.border;
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const fs = Math.max(8, Math.round(9 * sc));
      ctx.font      = `${fs}px Cinzel,serif`;
      ctx.fillStyle = C.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('NPCs', W / 2, sepY - 4);
    }
  }

  // ── Cross-connection edges ─────────────────────────────────────────────
  crossConns.forEach((c, ci) => {
    const pfx  = t => t === 'player' ? 'p' : t === 'npc' ? 'n' : 'r';
    const from = nodes[`${pfx(c.from_entity_type)}_${c.from_entity_id}`];
    const to   = nodes[`${pfx(c.to_entity_type)}_${c.to_entity_id}`];
    if (!from || !to) return;

    const x1 = sx(from.x), y1 = sy(from.y);
    const x2 = sx(to.x),   y2 = sy(to.y);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Fan overlapping cross-connections apart: alternate sides and step the
    // curvature outward so parallel DM links don't stack into one another.
    const curv = (30 + (ci % 3) * 26) * (ci % 2 === 0 ? 1 : -1);
    const cpx  = (x1 + x2) / 2 + (-dy / len) * curv;
    const cpy  = (y1 + y2) / 2 + (dx  / len) * curv;
    const lx   = (x1 + cpx * 2 + x2) / 4;
    const ly   = (y1 + cpy * 2 + y2) / 4;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    ctx.strokeStyle = c.is_public ? C.gold : C.red;
    ctx.lineWidth   = 1.5 * sc;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (c.label) {
      const fs = Math.max(7, Math.round(8 * sc));
      ctx.font      = `${fs}px Cinzel,serif`;
      ctx.fillStyle = c.is_public ? C.gold : C.red;
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.strokeText(c.label, lx, ly - 4 * sc);
      ctx.fillText(c.label, lx, ly - 4 * sc);
    }
  });

  // ── Nodes ─────────────────────────────────────────────────────────────
  ctx.setLineDash([]);
  Object.values(nodes).forEach(n => {
    const r = (n.r || NR) * sc;
    ctx.beginPath();
    ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2);

    if (n.type === 'player') {
      ctx.fillStyle   = C.goldDim;
      ctx.strokeStyle = C.gold;
      ctx.lineWidth   = 2.5 * sc;
    } else if (n.type === 'npc') {
      ctx.fillStyle   = isLight ? '#c8d8a0' : '#2d3a1a';
      ctx.strokeStyle = '#7ab050';
      ctx.lineWidth   = 1.5 * sc;
    } else {
      const rt = n.relType || 'Other';
      ctx.fillStyle   = FILL[rt] || FILL.Other;
      ctx.strokeStyle = RING[rt] || RING.Other;
      ctx.lineWidth   = 1.5 * sc;
    }
    ctx.fill();
    ctx.stroke();

    // Relation type micro-label (only family nodes, only if zoomed in)
    if (n.type === 'rel' && n.isFamily && n.relType && sc >= 0.55) {
      const smFs = Math.max(6, Math.round(7 * sc));
      ctx.font      = `${smFs}px Cinzel,serif`;
      ctx.fillStyle = TCOL[n.relType] || TCOL.Other;
      ctx.textAlign = 'center';
      ctx.fillText(n.relType, sx(n.x), sy(n.y) - r - 3 * sc);
    }

    // Node label
    const fs = Math.max(7, Math.round((n.type === 'player' ? 10 : 8) * sc));
    ctx.font      = `${n.type === 'player' ? 'bold ' : ''}${fs}px Cinzel,serif`;
    ctx.fillStyle = n.type === 'player' ? C.gold
                  : n.type === 'npc'    ? '#9aba70'
                  : TCOL[n.relType] || TCOL.Other;
    ctx.textAlign = 'center';
    const lbl = n.label.length > 13 ? n.label.slice(0, 12) + '…' : n.label;
    ctx.fillText(lbl, sx(n.x), sy(n.y) + r + 10 * sc);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hit test for tooltip
// ─────────────────────────────────────────────────────────────────────────────
function hitTest(mx, my, nodes, vp) {
  for (const n of Object.values(nodes)) {
    const sx = n.x * vp.scale + vp.ox;
    const sy = n.y * vp.scale + vp.oy;
    const r  = (n.r || NR) * vp.scale + 4;
    if ((mx - sx) ** 2 + (my - sy) ** 2 <= r * r) return n;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas component
// ─────────────────────────────────────────────────────────────────────────────
function TreeCanvas({ players, relationships, npcs, crossConnections, hiddenPlayers }) {
  const wrapRef    = useRef(null);
  const canvasRef  = useRef(null);
  const tooltipRef = useRef(null);
  const vpRef      = useRef({ scale: 1, ox: 0, oy: 0 });
  const nodesRef   = useRef({});
  const dragRef    = useRef(null);
  const didFitRef  = useRef(false); // fit-to-screen once; keep the user's zoom/pan after

  // Drop hidden players (and their relationships + any cross-connection touching
  // them) from the graph so the DM can declutter it.
  const vis = useMemo(() => {
    const hidden = hiddenPlayers || new Set();
    const relById = new Map(relationships.map(r => [r.id, r]));
    const ownerHidden = (type, id) => (
      type === 'player' ? hidden.has(id)
        : type === 'relationship' ? (relById.get(id) ? hidden.has(relById.get(id).player_id) : false)
          : false);
    return {
      players: players.filter(p => !hidden.has(p.player_id)),
      relationships: relationships.filter(r => !hidden.has(r.player_id)),
      crossConnections: crossConnections.filter(c =>
        !ownerHidden(c.from_entity_type, c.from_entity_id) && !ownerHidden(c.to_entity_type, c.to_entity_id)),
    };
  }, [players, relationships, crossConnections, hiddenPlayers]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    drawAll(c, nodesRef.current, vis.relationships, vis.crossConnections, vpRef.current);
  }, [vis]);

  // Rebuild nodes + fit viewport whenever data changes
  useEffect(() => {
    const c = canvasRef.current;
    const w = wrapRef.current;
    if (!c || !w) return;
    const W = w.clientWidth, H = 560;
    c.width = W; c.height = H;
    nodesRef.current = buildNodes(vis.players, vis.relationships, npcs, vis.crossConnections);
    // Only auto-fit the first time this canvas mounts (initial load / campaign
    // switch remounts it via the spinner). Later data changes — adding, editing,
    // hiding a player or a connection — redraw in place and keep zoom/pan.
    if (!didFitRef.current) {
      vpRef.current = fitViewport(nodesRef.current, W, H);
      didFitRef.current = true;
    }
    redraw();
  }, [vis, npcs, redraw]);

  // React synthetic mouse events don't reliably expose offsetX/offsetY — derive
  // canvas-local coords from the bounding rect so pan + hit-testing stay correct.
  function localPt(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onMouseDown(e) {
    const p = localPt(e);
    dragRef.current = { sx: p.x - vpRef.current.ox, sy: p.y - vpRef.current.oy };
  }
  function onMouseMove(e) {
    const p = localPt(e);
    if (dragRef.current) {
      vpRef.current.ox = p.x - dragRef.current.sx;
      vpRef.current.oy = p.y - dragRef.current.sy;
      redraw();
    }
    // Tooltip
    const tt  = tooltipRef.current;
    const hit = hitTest(p.x, p.y, nodesRef.current, vpRef.current);
    if (tt) {
      if (hit) {
        const lines = (hit.tooltip || hit.label).split('\n').filter(Boolean);
        tt.style.display = 'block';
        tt.style.left    = (p.x + 14) + 'px';
        tt.style.top     = (p.y + 10) + 'px';
        tt.innerHTML     = `<strong>${lines[0]}</strong>`
          + lines.slice(1).map(l => `<span style="display:block;color:var(--text-dim)">${l}</span>`).join('');
      } else {
        tt.style.display = 'none';
      }
    }
  }
  function onMouseUp()   { dragRef.current = null; }
  function onMouseLeave() {
    dragRef.current = null;
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }

  // Wheel-zoom via a native, non-passive listener so preventDefault() actually
  // stops the page from scrolling (React's onWheel is passive and warns).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const zf = e.deltaY < 0 ? 1.12 : 0.9;
      vpRef.current.ox    = e.offsetX - (e.offsetX - vpRef.current.ox) * zf;
      vpRef.current.oy    = e.offsetY - (e.offsetY - vpRef.current.oy) * zf;
      vpRef.current.scale = Math.max(0.15, Math.min(3, vpRef.current.scale * zf));
      redraw();
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [redraw]);

  return (
    <div ref={wrapRef} className="relative" style={{ height: 560 }}>
      <canvas
        ref={canvasRef}
        className="block w-full cursor-grab active:cursor-grabbing"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2 }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}     onMouseLeave={onMouseLeave}
      />
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          display: 'none', position: 'absolute', pointerEvents: 'none',
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 2, padding: '5px 8px',
          fontSize: 11, fontFamily: 'var(--fb)', color: 'var(--text)',
          maxWidth: 220, boxShadow: '0 2px 8px rgba(0,0,0,.5)', zIndex: 10,
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity label helpers
// ─────────────────────────────────────────────────────────────────────────────
function getEntityLabel(type, id, players, relationships, npcs) {
  if (type === 'player') {
    const p = players.find(x => x.player_id === id);
    return p ? `👤 ${p.player_name}` : `Player #${id}`;
  }
  if (type === 'relationship') {
    const r = relationships.find(x => x.id === id);
    return r ? `↳ ${r.player_name}: ${r.name}` : `Rel #${id}`;
  }
  if (type === 'npc') {
    const n = npcs.find(x => x.id === id);
    return n ? `🧟 ${n.name}` : `NPC #${id}`;
  }
  return `${type} #${id}`;
}

/** Bare name (no emoji) for a cross-connection endpoint — used for sorting. */
function entityName(type, id, players, relationships, npcs) {
  if (type === 'player') return players.find(x => x.player_id === id)?.player_name || `Player #${id}`;
  if (type === 'relationship') { const r = relationships.find(x => x.id === id); return r ? `${r.player_name}: ${r.name}` : `Rel #${id}`; }
  if (type === 'npc') return npcs.find(x => x.id === id)?.name || `NPC #${id}`;
  return `${type} #${id}`;
}

function buildEntityOptions(players, relationships, npcs) {
  const opts = [];
  players.forEach(p =>
    opts.push({ key: `p_${p.player_id}`, label: `👤 ${p.player_name}` })
  );
  const byPlayer = {};
  relationships.forEach(r => {
    if (!byPlayer[r.player_id]) byPlayer[r.player_id] = [];
    byPlayer[r.player_id].push(r);
  });
  Object.values(byPlayer).forEach(rels =>
    rels.forEach(r =>
      opts.push({ key: `r_${r.id}`, label: `  ↳ ${r.player_name}: ${r.name} (${r.relation_type || 'rel'})` })
    )
  );
  npcs.forEach(n =>
    opts.push({ key: `n_${n.id}`, label: `🧟 ${n.name}` })
  );
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection row
// ─────────────────────────────────────────────────────────────────────────────
function ConnRow({ conn, players, relationships, npcs, onEdit, onDelete, onToggle }) {
  const from = getEntityLabel(conn.from_entity_type, conn.from_entity_id, players, relationships, npcs);
  const to   = getEntityLabel(conn.to_entity_type,   conn.to_entity_id,   players, relationships, npcs);
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <div className="flex-1 text-xs font-body min-w-0">
        <span className="text-gold">{from}</span>
        <span className="text-text-muted mx-1.5">— {conn.label} →</span>
        <span className="text-gold">{to}</span>
        {conn.notes && <p className="text-text-muted mt-0.5 italic truncate">{conn.notes}</p>}
        {!conn.is_public && (
          <span className="inline-block mt-0.5 text-[0.55rem] border border-border px-1 rounded-sm text-text-muted">
            🔒 DM only
          </span>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onToggle(conn.id)}
          className="text-text-muted hover:text-gold transition-colors p-1"
          title={conn.is_public ? 'Hide from players' : 'Show to players'}>
          {conn.is_public ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button onClick={() => onEdit(conn)}
          className="text-text-muted hover:text-gold transition-colors p-1" title="Edit">
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(conn.id)}
          className="text-text-muted hover:text-danger transition-colors p-1" title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit modal
// ─────────────────────────────────────────────────────────────────────────────
function ConnModal({ open, onClose, onSave, editData, entityOptions }) {
  const [form, setForm] = useState({ fromKey: '', toKey: '', label: '', notes: '' });
  const isEdit = !!editData;

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const pfx = t => t === 'relationship' ? 'r' : t === 'npc' ? 'n' : 'p';
      setForm({
        fromKey: `${pfx(editData.from_entity_type)}_${editData.from_entity_id}`,
        toKey:   `${pfx(editData.to_entity_type)}_${editData.to_entity_id}`,
        label:   editData.label ?? '',
        notes:   editData.notes ?? '',
      });
    } else {
      setForm({ fromKey: '', toKey: '', label: '', notes: '' });
    }
  }, [open, isEdit, editData]);

  const ff       = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const inputCls = 'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';
  const valid    = form.label.trim() && (isEdit || (form.fromKey && form.toKey && form.fromKey !== form.toKey));

  return (
    <Modal open={open} onClose={onClose} onSubmit={() => { if (valid) onSave(form); }} title={isEdit ? 'Edit Connection' : 'Add DM Cross-Connection'}>
      <div className="flex flex-col gap-3">
        {!isEdit && (
          <>
            <FormField label="From">
              <select value={form.fromKey} onChange={ff('fromKey')} className={inputCls}>
                <option value="">— Select entity —</option>
                {entityOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </FormField>
            <FormField label="To">
              <select value={form.toKey} onChange={ff('toKey')} className={inputCls}>
                <option value="">— Select entity —</option>
                {entityOptions.filter(o => o.key !== form.fromKey).map(o =>
                  <option key={o.key} value={o.key}>{o.label}</option>
                )}
              </select>
            </FormField>
          </>
        )}
        <FormField label="Connection label">
          <input type="text" value={form.label} onChange={ff('label')}
            placeholder="e.g., secretly allied with…" className={inputCls} autoFocus={isEdit} />
        </FormField>
        <FormField label="Notes (DM only, optional)">
          <textarea value={form.notes} onChange={ff('notes')} rows={2}
            className={inputCls + ' resize-none'} />
        </FormField>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost"   onClick={onClose}>Cancel</Button>
          <Button variant="accent"  onClick={() => onSave(form)} disabled={!valid}>
            {isEdit ? 'Save' : 'Add Connection'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported tab
// ─────────────────────────────────────────────────────────────────────────────
export function CharTreeTab({ campaignId }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [connModal, setConnModal] = useState(false);
  const [editConn,  setEditConn]  = useState(null);
  const [hiddenPlayers, setHiddenPlayers] = useState(() => new Set()); // hidden from the tree
  const togglePlayer = (pid) => setHiddenPlayers((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });

  // `silent` refreshes in place without the full-tab spinner, so the canvas
  // isn't unmounted (which would reset its zoom/pan and scroll the page up).
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!campaignId) return;
    if (!silent) setLoading(true);
    try {
      const d = await campaignsApi.getCharTree(campaignId);
      setData(d);
    } catch (e) {
      toast(`Could not load character tree: ${e.message}`, 'error');
      setData({ players: [], relationships: [], npcs: [], cross_connections: [] });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [campaignId, toast]);

  useEffect(() => { load(); }, [load]);

  const players          = data?.players          ?? [];
  const relationships    = data?.relationships     ?? [];
  const npcs             = data?.npcs             ?? [];
  const crossConnections = data?.cross_connections ?? [];
  const entityOptions    = buildEntityOptions(players, relationships, npcs);

  async function handleSave(form) {
    if (editConn) {
      await campaignsApi.editCharConnection(campaignId, editConn.id,
        { label: form.label, notes: form.notes || null });
    } else {
      await campaignsApi.addCharConnection(campaignId, {
        from_rel_id: form.fromKey,
        to_rel_id:   form.toKey,
        label:       form.label,
        notes:       form.notes || null,
      });
    }
    setConnModal(false); setEditConn(null);
    load({ silent: true });
  }

  async function handleDelete(id) {
    if (!await confirm('Delete this connection?', { title: 'Delete connection', confirmLabel: 'Delete' })) return;
    await campaignsApi.removeCharConnection(campaignId, id);
    load({ silent: true });
  }

  // Optimistic: flip the visibility flag locally (no refetch → viewport kept).
  async function handleToggle(id) {
    const flip = () => setData(d => (d ? {
      ...d,
      cross_connections: (d.cross_connections ?? []).map(c =>
        c.id === id ? { ...c, is_public: !c.is_public } : c),
    } : d));
    flip();
    try {
      await campaignsApi.toggleCharConnVis(campaignId, id);
    } catch (e) {
      flip(); // revert
      toast(`Could not update connection: ${e.message}`, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-4">

      {/* Canvas */}
      <TreeCanvas
        players={players}
        relationships={relationships}
        npcs={npcs}
        crossConnections={crossConnections}
        hiddenPlayers={hiddenPlayers}
      />

      {/* Players — toggle each in/out of the tree (name only) */}
      {players.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const hidden = hiddenPlayers.has(p.player_id);
            return (
              <button
                key={p.player_id}
                type="button"
                onClick={() => togglePlayer(p.player_id)}
                title={hidden ? 'Show in tree' : 'Hide from tree'}
                className={`inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface2 px-2 py-1 text-xs font-body hover:border-gold ${hidden ? 'opacity-45 line-through' : 'text-text'}`}
              >
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                ⚔️ {p.player_name}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-5 flex-wrap text-xs font-body text-text-dim">
        <span><span className="inline-block w-3 h-3 rounded-full bg-[var(--gold-dim)] border-2 border-gold mr-1 align-middle"/>Player</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2d3a1a] border border-[#7ab050] mr-1 align-middle"/>NPC</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#362206] border border-[#b07828] mr-1 align-middle"/>Family rel</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#062c1a] border border-[#288858] mr-1 align-middle"/>Social rel</span>
        <span className="text-text-muted">Scroll to zoom · Drag to pan · Hover for details</span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-text-dim flex-wrap border-t border-border pt-3">
        <span>👤 {players.length} players</span>
        <span>🔗 {relationships.length} relationships</span>
        <span>🧟 {npcs.filter(n => crossConnections.some(c =>
          (c.from_entity_type === 'npc' && c.from_entity_id === n.id) ||
          (c.to_entity_type   === 'npc' && c.to_entity_id   === n.id)
        )).length} connected NPCs</span>
        <span>🕸 {crossConnections.length} cross-connections</span>
      </div>

      {/* Cross-connections list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-display text-gold uppercase tracking-wider text-xs">DM Cross-Connections</h4>
          <Button variant="accent" onClick={() => { setEditConn(null); setConnModal(true); }}>
            <Plus size={12} className="inline mr-1"/> Add
          </Button>
        </div>
        {crossConnections.length === 0 ? (
          <p className="text-text-dim text-xs italic py-3 text-center">
            No DM cross-connections yet. Link any two entities (players, relationships, NPCs) here.
          </p>
        ) : (
          (() => {
            const hasPlayer = (c) => c.from_entity_type === 'player' || c.to_entity_type === 'player';
            const hasNpc = (c) => c.from_entity_type === 'npc' || c.to_entity_type === 'npc';
            const byFromName = (a, b) => entityName(a.from_entity_type, a.from_entity_id, players, relationships, npcs)
              .localeCompare(entityName(b.from_entity_type, b.from_entity_id, players, relationships, npcs));
            // Priority partition: player-involved → Player; else NPC-involved → NPC
            // (npc↔npc + rel↔npc); else → Relationships (rel↔rel).
            const playerLinks = crossConnections.filter(hasPlayer).sort(byFromName);
            const relLinks = crossConnections.filter(c => !hasPlayer(c) && !hasNpc(c)).sort(byFromName);
            const npcLinks = crossConnections.filter(c => !hasPlayer(c) && hasNpc(c)).sort(byFromName);
            const column = (title, list) => (
              <div>
                <div className="font-display text-text-dim uppercase tracking-wider text-[0.65rem] mb-1 pb-1 border-b border-border">{title}</div>
                {list.length === 0
                  ? <p className="text-text-dim text-xs italic py-2">None.</p>
                  : list.map(c => (
                    <ConnRow key={c.id} conn={c}
                      players={players} relationships={relationships} npcs={npcs}
                      onEdit={cc => { setEditConn(cc); setConnModal(true); }}
                      onDelete={handleDelete} onToggle={handleToggle}
                    />
                  ))}
              </div>
            );
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
                {column(`👥 Relationship links (${relLinks.length})`, relLinks)}
                {column(`👤 Player links (${playerLinks.length})`, playerLinks)}
                {column(`🧟 NPC links (${npcLinks.length})`, npcLinks)}
              </div>
            );
          })()
        )}
      </div>

      <ConnModal
        open={connModal}
        onClose={() => { setConnModal(false); setEditConn(null); }}
        onSave={handleSave}
        editData={editConn}
        entityOptions={entityOptions}
      />
    </div>
  );
}
