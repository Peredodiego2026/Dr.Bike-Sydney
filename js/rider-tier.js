// Gamification: a free loyalty tier based on completed jobs, distinct from the
// paid Basic/Standard/VIP memberships shown elsewhere. Kept dependency-free
// (no DOM access) so it can be unit tested directly.
//
// Medal art (Bronze/Silver/Gold/Diamond) is a hand-drawn SVG placeholder, not
// the photorealistic AI render the design spec calls for - the Gemini image
// API key on this project has no billing enabled (free tier quota = 0 for
// image generation). Diego chose to proceed with placeholders rather than
// block Fase 0 (2026-07-11). Swap these 4 files for real renders once billing
// is sorted or another image source is provided - no code changes needed
// beyond dropping in new files at the same paths.
export function getRiderTier(completed) {
  const tiers = [
    {
      min: 0,
      label: 'New Rider',
      image: 'images/bike-icon.png',
      iconType: 'mask',
      color: '#94A3B8',
    },
    {
      min: 3,
      label: 'Bronze Rider',
      image: 'images/medals/bronze.svg',
      iconType: 'photo',
      color: '#B45309',
    },
    {
      min: 6,
      label: 'Silver Rider',
      image: 'images/medals/silver.svg',
      iconType: 'photo',
      color: '#64748B',
    },
    {
      min: 10,
      label: 'Gold Rider',
      image: 'images/medals/gold.svg',
      iconType: 'photo',
      color: '#D97706',
    },
    {
      min: 20,
      label: 'Diamond Rider',
      image: 'images/medals/diamond.svg',
      iconType: 'photo',
      color: '#2563EB',
    },
  ];
  let current = tiers[0];
  let next = null;
  for (let i = 0; i < tiers.length; i++) {
    if (completed >= tiers[i].min) {
      current = tiers[i];
      next = tiers[i + 1] || null;
    }
  }
  const progressPct = next
    ? Math.min(100, Math.round(((completed - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    label: current.label,
    image: current.image,
    iconType: current.iconType,
    color: current.color,
    nextAt: next ? next.min : null,
    nextLabel: next ? next.label : null,
    progressPct,
  };
}
