// Gamification: a free loyalty tier based on completed jobs, distinct from the
// paid Basic/Standard/VIP memberships shown elsewhere. Kept dependency-free
// (no DOM access) so it can be unit tested directly.
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
      image: 'images/medals/bronze.png',
      iconType: 'photo',
      color: '#B45309',
    },
    {
      min: 6,
      label: 'Silver Rider',
      image: 'images/medals/silver.png',
      iconType: 'photo',
      color: '#64748B',
    },
    {
      min: 10,
      label: 'Gold Rider',
      image: 'images/medals/gold.png',
      iconType: 'photo',
      color: '#D97706',
    },
    {
      min: 20,
      label: 'Diamond Rider',
      image: 'images/medals/diamond.png',
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
