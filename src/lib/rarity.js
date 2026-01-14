// Centralized visual tokens for shop rarity styling.
const rarityTokens = {
  uncommon: {
    base: '#22c55e',
    accent: '#22c55e',
    border: '#16a34a',
    stripFrom: '#22c55e',
    stripTo: '#22c55e',
    labelFrom: '#16a34a',
    labelTo: '#22c55e',
    icon: 'leaf',
    buttonBg: '#ecfdf3',
    buttonText: '#14532d',
    buttonBorder: '#22c55e',
    shadow: 'rgba(34,197,94,0.12)',
    hoverShadow: 'rgba(34,197,94,0.18)',
    glow: 'rgba(0,0,0,0)',
    focus: 'rgba(34,197,94,0.35)'
  },
  rare: {
    base: '#3b82f6',
    accent: '#d1d5db',
    border: '#2563eb',
    stripFrom: '#3b82f6',
    stripTo: '#1d4ed8',
    labelFrom: '#cbd5e1',
    labelTo: '#6b7280',
    icon: 'diamond',
    buttonBg: '#eff6ff',
    buttonText: '#1e3a8a',
    buttonBorder: '#60a5fa',
    shadow: 'rgba(59,130,246,0.14)',
    hoverShadow: 'rgba(59,130,246,0.22)',
    glow: 'rgba(0,0,0,0)',
    focus: 'rgba(59,130,246,0.35)'
  },
  legendary: {
    base: '#8b5cf6',
    accent: '#f5c451',
    border: '#d4a445',
    stripFrom: '#f6c453',
    stripTo: '#7c3aed',
    labelFrom: '#edc26f',
    labelTo: '#8a5a18',
    icon: 'crown',
    buttonBg: '#fef7e6',
    buttonText: '#6b3f00',
    buttonBorder: '#f3c15d',
    shadow: 'rgba(124,58,237,0.18)',
    hoverShadow: 'rgba(124,58,237,0.28)',
    glow: 'rgba(245,197,105,0.22)',
    focus: 'rgba(245,197,105,0.38)'
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

module.exports = {
  rarityTokens,
  normalizeRarity,
  getRarityTokens
};
