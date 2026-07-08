// ── Rider Tier System ──────────────────────────────────────────────────────
// 5 tiers: New Rider, Bronze, Silver, Gold, Diamond
// Based on total completed jobs count. Exported for ES6 module import.

const TIERS = [
  { min: 0,  name: 'New Rider',  emoji: '🚲', color: '#94A3B8', bgColor: '#F3F4F6' },
  { min: 3,  name: 'Bronze',     emoji: '🥉', color: '#B45309', bgColor: 'rgba(180,83,9,0.12)' },
  { min: 6,  name: 'Silver',     emoji: '🥈', color: '#64748B', bgColor: 'rgba(100,116,139,0.14)' },
  { min: 10, name: 'Gold',       emoji: '🥇', color: '#D97706', bgColor: 'rgba(217,119,6,0.15)' },
  { min: 20, name: 'Diamond',    emoji: '💎', color: '#2563EB', bgColor: 'rgba(37,99,235,0.12)' },
];

export function getRiderTier(completed) {
  const count = completed || 0;
  let tier = TIERS[0];
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (count >= TIERS[i].min) { tier = TIERS[i]; break; }
  }
  const nextIndex = TIERS.indexOf(tier) + 1;
  const next = nextIndex < TIERS.length ? TIERS[nextIndex] : null;
  const progress = next ? Math.min(100, Math.round(((count - tier.min) / (next.min - tier.min)) * 100)) : 100;
  return {
    label: tier.name, name: tier.name, emoji: tier.emoji, color: tier.color,
    bgColor: tier.bgColor, count, nextLabel: next ? next.name : null,
    nextTierName: next ? next.name : null, progressPct: progress, progress,
    nextAt: next ? next.min : null,
  };
}

// Medal image renderer (SVG images in images/medals/)
function renderMedalImage(tierName, size = 48) {
  var fileName = (tierName || '').toLowerCase().replace(/ /g, '-');
  if (!fileName || fileName === 'new-rider') fileName = 'new-rider';
  return '<div class="medal-wrap" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<img src="images/medals/' + fileName + '.svg" alt="' + (tierName || '') + '" width="' + size + '" height="' + size + '" style="display:block"'
    + ' onerror="this.parentElement.innerHTML=\'<div style=width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.55) + 'px>' + (TIERS[0].emoji) + '</div>\'">'
    + '</div>';
}

// Full tier badge with progress bar
export function renderTierBadge(tier, size) {
  size = size || 48;
  var name = tier.name || tier.label || 'New Rider';
  var color = tier.color || '#94A3B8';
  var bgColor = tier.bgColor || '#F3F4F6';
  var progress = tier.progressPct != null ? tier.progressPct : tier.progress || 100;
  var nextTierName = tier.nextLabel || tier.nextTierName || null;
  var count = tier.count || 0;
  return '<div class="tier-badge" style="'
    + 'display:flex;align-items:center;gap:12px;padding:12px 14px;'
    + 'border-radius:12px;border:1px solid var(--color-border, #E5E7EB);'
    + 'background:var(--color-surface, #F9FAFB)">'
    + renderMedalImage(name, size)
    + '<div style="flex:1;min-width:0">'
    +   '<div style="font-size:15px;font-weight:700;color:#0D1F3C">' + name + '</div>'
    +   '<div style="font-size:12px;color:#6B7280;margin-top:2px">' + count + ' job' + (count !== 1 ? 's' : '') + ' completed</div>'
    +   (nextTierName
        ? '<div style="margin-top:6px;height:6px;background:#E5E7EB;border-radius:3px">'
          +   '<div style="height:100%;width:' + progress + '%;background:' + color + ';border-radius:3px;transition:width 500ms var(--ease-out, cubic-bezier(0.4,0,0.2,1))"></div>'
          + '</div>'
          + '<div style="font-size:11px;color:#6B7280;margin-top:3px">' + nextTierName + ' &middot; ' + ((TIERS.find(function(t){return t.name===nextTierName;})||{}).min - count || '?') + ' jobs to go</div>'
        : '<div style="margin-top:6px;height:6px;background:' + bgColor + ';border-radius:3px">'
          +   '<div style="height:100%;width:100%;background:' + color + ';border-radius:3px"></div>'
          + '</div>'
          + '<div style="font-size:11px;color:' + color + ';font-weight:600;margin-top:3px">Maximum tier reached</div>')
    + '</div></div>';
}

// Also attach to window for async usage
window.getRiderTier = getRiderTier;
window.renderTierBadge = renderTierBadge;
window.renderMedalImage = renderMedalImage;
