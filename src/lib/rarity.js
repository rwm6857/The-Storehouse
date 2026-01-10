const rarityTokens = {
  uncommon: {
    spineFrom: '#34D399',
    spineTo: '#059669',
    border: '#10B981',
    glow: 'rgba(16,185,129,0.14)'
  },
  rare: {
    spineFrom: '#60A5FA',
    spineTo: '#2563EB',
    border: '#3B82F6',
    glow: 'rgba(59,130,246,0.16)'
  },
  legendary: {
    spineFrom: '#FBBF24',
    spineTo: '#B45309',
    border: '#F59E0B',
    glow: 'rgba(245,158,11,0.20)'
  }
};

const allowedRarities = new Set(['common', 'uncommon', 'rare', 'legendary']);

function normalizeRarity(input) {
  const value = (input || 'common').toString().trim().toLowerCase();
  return allowedRarities.has(value) ? value : 'common';
}

function getRarityTokens(rarity) {
  const normalized = normalizeRarity(rarity);
  if (normalized === 'common') {
    return null;
  }
  return rarityTokens[normalized] || null;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '').trim();
  const normalized = clean.length === 3
    ? clean
        .split('')
        .map((ch) => ch + ch)
        .join('')
    : clean;
  if (normalized.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

module.exports = {
  rarityTokens,
  normalizeRarity,
  getRarityTokens,
  hexToRgba
};
