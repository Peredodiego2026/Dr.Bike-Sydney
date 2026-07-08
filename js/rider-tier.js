// ── Rider Tier System ──────────────────────────────────────────────────────
// 5 tiers: New Rider, Bronze, Silver, Gold, Diamond
// Based on total completed jobs count

const RIDER_TIERS = [
  { name: 'New Rider',        min: 0, emoji: '🚲', color: '#6B7280', bgColor: '#F3F4F6' },
  { name: 'Bronze',           min: 3, emoji: '🥉', color: '#CD7F32', bgColor: 'rgba(205,127,50,0.12)' },
  { name: 'Silver',           min: 5, emoji: '🥈', color: '#A8A9AD', bgColor: 'rgba(168,169,173,0.14)' },
  { name: 'Gold',             min: 8, emoji: '🥇', color: '#D4AF37', bgColor: 'rgba(212,175,55,0.15)' },
  { name: 'Diamond',          min: 12,emoji: '💎', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.12)' },
];

function getRiderTier(completedJobs) {
  const count = completedJobs || 0;
  let tier = RIDER_TIERS[0];
  for (let i = RIDER_TIERS.length - 1; i >= 0; i--) {
    if (count >= RIDER_TIERS[i].min) { tier = RIDER_TIERS[i]; break; }
  }
  const nextTierIndex = RIDER_TIERS.indexOf(tier) + 1;
  const nextTier = nextTierIndex < RIDER_TIERS.length ? RIDER_TIERS[nextTierIndex] : null;
  const progress = nextTier ? Math.min(100, ((count - tier.min) / (nextTier.min - tier.min)) * 100) : 100;
  return { ...tier, count, nextTierName: nextTier?.name || null, progress: Math.round(progress) };
}

function renderMedalImage(tierName, size = 48) {
  const fileName = tierName.toLowerCase().replace(' ', '-');
  return `<div class="medal-wrap" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
    <img src="images/medals/${fileName}.svg" alt="${tierName}" width="${size}" height="${size}" style="display:block"
      onerror="this.parentElement.innerHTML='<div style=width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.55)}px>${getRiderTier(0).emoji}</div>'">
  </div>`;
}

function renderTierBadge(tier, size = 48) {
  const { name, color, bgColor, progress, nextTierName, count } = tier;
  return `
    <div class="tier-badge" style="
      display:flex;align-items:center;gap:12px;padding:12px 14px;
      border-radius:12px;border:1px solid var(--color-border, #E5E7EB);
      background:var(--color-surface, #F9FAFB)">
      ${renderMedalImage(name, size)}
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;color:#0D1F3C">${name}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:2px">${count} job${count !== 1 ? 's' : ''} completed</div>
        ${nextTierName ? `
          <div style="margin-top:6px;height:6px;background:#E5E7EB;border-radius:3px">
            <div style="height:100%;width:${progress}%;background:${color};border-radius:3px;transition:width 500ms var(--ease-out, cubic-bezier(0.4,0,0.2,1))"></div>
          </div>
          <div style="font-size:11px;color:#6B7280;margin-top:3px">${nextTierName} · ${RIDER_TIERS[RIDER_TIERS.indexOf(RIDER_TIERS.find(t => t.name === nextTierName))]?.min - count || '?'} jobs to go</div>
        ` : `
          <div style="margin-top:6px;height:6px;background:${bgColor};border-radius:3px">
            <div style="height:100%;width:100%;background:${color};border-radius:3px"></div>
          </div>
          <div style="font-size:11px;color:${color};font-weight:600;margin-top:3px">Maximum tier reached</div>
        `}
      </div>
    </div>`;
}

window.getRiderTier = getRiderTier;
window.renderTierBadge = renderTierBadge;
window.renderMedalImage = renderMedalImage;
