/**
 * components/map/pinIcons.jsx
 *
 * Location pins are drawn as a vector icon chosen by the location's size/type,
 * on a subtle dark disc for legibility over busy map art. Shared by the editor
 * (EditorLayers) and the public map (MapLayers) so both look identical.
 *
 * Icons are lucide-react components (already a dependency) → crisp at any zoom
 * and per-pin scale, with no image assets to bundle or upload.
 */

import {
  Castle, Building2, Building, Home, Tent, BedDouble, Landmark, Anchor, Milestone, MapPin,
} from 'lucide-react';

/** Icon box size (image-pixel units) at scale = 1. */
export const BASE_PIN = 26;

// size_type (lowercased) → icon. Unmapped / empty falls back to MapPin.
const ICON_BY_SIZE = {
  huge:         Castle,
  big:          Castle,
  medium:       Building2,
  small:        Home,
  village:      Tent,
  neighborhood: Building,
  inn:          BedDouble,
  landmark:     Landmark,
  post:         Milestone,
  port:         Anchor,
  region:       MapPin,
  other:        MapPin,
};

export function iconForSize(sizeType) {
  return ICON_BY_SIZE[(sizeType || '').toLowerCase()] || MapPin;
}

/** Canonical, lowercase size_type keys (for the admin type-image editor). */
export const SIZE_TYPE_KEYS = Object.keys(ICON_BY_SIZE);
export const SIZE_TYPE_LABELS = {
  huge: 'Huge', big: 'Big', medium: 'Medium', small: 'Small', village: 'Village',
  neighborhood: 'Neighborhood', inn: 'Inn', landmark: 'Landmark', post: 'Post',
  port: 'Port', region: 'Region', other: 'Other',
};

/**
 * The image a pin should use: its own custom image, else the global default for its
 * size_type, else null (→ vector icon). `typeImages` is the { size_type: dataUrl } map.
 */
export function effectivePinImage(loc, typeImages) {
  return (loc && loc.image_data)
    || (typeImages && typeImages[(loc?.size_type || '').toLowerCase()])
    || null;
}

/** Effective on-map pin size for a given per-pin scale (defaults to 1). */
export function pinSize(scale) {
  const s = Number(scale);
  return BASE_PIN * (Number.isFinite(s) && s > 0 ? s : 1);
}

/**
 * Text format for a pin's name label, keyed by size/type so the settlement
 * hierarchy reads at a glance. `upper` is a flag consumed by <MapLabel>, not a
 * CSS prop. Shared by the editor and the public map so both look identical.
 */
export function pinLabelStyle(sizeType) {
  const s = (sizeType || '').toLowerCase();
  if (s === 'huge' || s === 'big')
    return { fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', upper: true };
  if (s === 'medium' || s === 'small')
    return { fontSize: 11, fontWeight: 600 };
  if (s === 'village' || s === 'landmark' || s === 'post')
    return { fontSize: 10, fontWeight: 500 };
  return { fontSize: 9, fontStyle: 'italic' }; // inn / neighborhood / other / none
}

/**
 * A location pin centered at (x, y) in SVG image-pixel space. The filled disc
 * doubles as the click/drag hit target (events bubble to the parent <g>); the
 * icon itself is pointer-transparent. Backing opacity is intentionally subtle.
 */
export function PinIcon({ x, y, sizeType, scale, selected, imageUrl }) {
  const size = pinSize(scale);
  const half = size / 2;
  const stroke = selected ? '#e8c96a' : '#7a6030';
  const strokeWidth = selected ? 2 : 1.2;

  // Custom image → circular-clipped photo pin (falls back to the vector icon below).
  if (imageUrl) {
    const clipId = `pinclip-${Math.round(x * 10)}-${Math.round(y * 10)}-${Math.round(size)}`;
    return (
      <>
        {/* Filled backing doubles as the click/drag hit target (events bubble to the parent <g>). */}
        <circle cx={x} cy={y} r={half} fill="#1e1810" opacity={selected ? 0.9 : 0.7} />
        <clipPath id={clipId}><circle cx={x} cy={y} r={half} /></clipPath>
        <image
          href={imageUrl} x={x - half} y={y - half} width={size} height={size}
          clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice"
          style={{ pointerEvents: 'none' }}
        />
        <circle cx={x} cy={y} r={half} fill="none" stroke={stroke} strokeWidth={strokeWidth} style={{ pointerEvents: 'none' }} />
      </>
    );
  }

  const Icon = iconForSize(sizeType);
  const color = selected ? '#e8c96a' : '#c9a84c';
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={half}
        fill="#1e1810"
        opacity={selected ? 0.8 : 0.5}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <g transform={`translate(${x - half}, ${y - half})`} style={{ pointerEvents: 'none' }}>
        <Icon width={size} height={size} color={color} strokeWidth={2} />
      </g>
    </>
  );
}
