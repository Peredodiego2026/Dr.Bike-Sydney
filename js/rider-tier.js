// Gamification: a free loyalty tier based on completed jobs, distinct from the
// paid Basic/Standard/VIP memberships shown elsewhere. Kept dependency-free
// (no DOM access) so it can be unit tested directly.
export function getRiderTier(completed) {
  const tiers = [
    { min: 0, label: 'New Rider', emoji: '🚲', color: '#94A3B8' },
    { min: 3, label: 'Bronze Rider', emoji: '🥉', color: '#B45309' },
    { min: 6, label: 'Silver Rider', emoji: '🥈', color: '#64748B' },
    { min: 10, label: 'Gold Rider', emoji: '🥇', color: '#D97706' },
    { min: 20, label: 'Diamond Rider', emoji: '💎', color: '#2563EB' },
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
    emoji: current.emoji,
    color: current.color,
    nextAt: next ? next.min : null,
    nextLabel: next ? next.label : null,
    progressPct,
  };
}
