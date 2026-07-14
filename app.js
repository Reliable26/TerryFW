const FIRE_CODE_MIN = 100;
const FIRE_CODE_MAX = 199;
let allItems = [];
let currentFilter = 'All';

function parseCode(item) {
  const fields = [item.incidentCode, item.incidentType, item.whyFlagged, item.rawIncidentType].filter(Boolean).join(' ');
  const match = String(fields).match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

function isStrictFireItem(item) {
  const code = parseCode(item);
  return Number.isInteger(code) && code >= FIRE_CODE_MIN && code <= FIRE_CODE_MAX;
}

function formatDate(value, includeTime = false) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const opts = { month:'long', day:'numeric', year:'numeric' };
  if (includeTime) Object.assign(opts, { hour:'numeric', minute:'2-digit', second:'2-digit' });
  return d.toLocaleString('en-US', opts);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function permitSearchQuery(address) {
  return `${address} Charlotte NC permit fire repair`;
}

function itemMatchesFilter(item) {
  if (currentFilter === 'All') return true;
  if (currentFilter === 'Archived') return item.archive === true || /archived/i.test(item.status || '');
  if (currentFilter === 'Older But Actionable') return /older but actionable/i.test(item.status || '');
  if (currentFilter === 'New Fires') return /new fire/i.test(item.status || '') || (item.ageDays ?? 999) <= 7;
  if (currentFilter === 'Single-Family Strategic') return /single-family/i.test(item.propertyType || '');
  if (currentFilter === 'Brush Fire Strategic') return /brush/i.test(item.propertyType || '');
  return String(item.propertyType || '').toLowerCase().includes(currentFilter.toLowerCase());
}

function recommendedServices(item) {
  const list = item.recommendedServices || ['Fire Restoration','Smoke Cleaning','Water Mitigation','Reconstruction','Interior Build Back','Roofing / Exterior Repair Review'];
  return list.map(s => `<li>${escapeHtml(s)}</li>`).join('');
}

function render() {
  const cleanItems = allItems.filter(isStrictFireItem);
  const visible = cleanItems.filter(itemMatchesFilter);
  document.getElementById('activeCount').textContent = cleanItems.length;
  document.getElementById('highCount').textContent = cleanItems.filter(i => Number(i.opportunityScore || 0) >= 80).length;
  document.getElementById('olderCount').textContent = cleanItems.filter(i => /older but actionable/i.test(i.status || '')).length;

  const cards = document.getElementById('cards');
  const empty = document.getElementById('empty');
  cards.innerHTML = '';
  empty.hidden = visible.length !== 0;

  for (const item of visible) {
    const address = item.address || 'Address not available';
    const searchLine = item.propertyName && !/not yet verified/i.test(item.propertyName) ? `${item.propertyName} ${address}` : address;
    const el = document.createElement('details');
    el.className = 'card';
    el.innerHTML = `
      <summary>
        <div>
          <div class="title">${escapeHtml(item.propertyName || 'Property name not yet verified')}</div>
          <div class="meta">${escapeHtml(address)}</div>
          <div class="meta">${formatDate(item.fireDate)} | ${escapeHtml(item.propertyType || 'Needs Property Verification')} | ${escapeHtml(item.status || 'Confirmed Fire')}</div>
          <div class="copybar">
            <button type="button" data-copy="${escapeHtml(address)}" data-label="Copy Address">Copy Address</button>
            <button type="button" data-copy="${escapeHtml(searchLine)}" data-label="Copy Search Line">Copy Search Line</button>
            <a class="action-link" href="${escapeHtml(googleSearchUrl(searchLine))}" target="_blank" rel="noopener">Search Address</a>
            <a class="action-link" href="${escapeHtml(googleSearchUrl(`${address} fire`))}" target="_blank" rel="noopener">Search Address + Fire</a>
            <a class="action-link" href="${escapeHtml(googleSearchUrl(permitSearchQuery(address)))}" target="_blank" rel="noopener">Search Permits</a>
            <a class="action-link" href="${escapeHtml(mapsSearchUrl(address))}" target="_blank" rel="noopener">Open Map</a>
          </div>
        </div>
        <div class="score">${escapeHtml(item.opportunityScore ?? 0)}<small> Score</small></div>
      </summary>
      <div class="details">
        <div>
          <h3>Why Flagged</h3>
          <p>${escapeHtml(item.whyFlagged || 'Confirmed 100-series fire incident from public source.')}</p>
          <h3>Recommended Services</h3>
          <ul>${recommendedServices(item)}</ul>
        </div>
        <div>
          <h3>Why This Matters</h3>
          <p>${escapeHtml(item.whyThisMatters || 'A confirmed fire can create restoration, smoke cleaning, water mitigation from suppression activity, reconstruction, roofing, exterior repair, and interior build-back needs. Exact property details should be verified before outreach.')}</p>
          <h3>Source</h3>
          <p><a href="${escapeHtml(item.sourceUrl || '#')}" target="_blank" rel="noopener">${escapeHtml(item.sourceTitle || 'Charlotte CFD Public Incident Reports')}</a></p>
          <p class="meta">Incident code: ${escapeHtml(parseCode(item) || 'Unknown')}. Public incident data may provide an address block rather than an exact address.</p>
        </div>
      </div>`;
    cards.appendChild(el);
  }
}

async function loadData() {
  const stamp = Date.now();
  const res = await fetch(`data/firewatch.json?v=${stamp}`, { cache:'no-store' });
  if (!res.ok) throw new Error('Unable to load data/firewatch.json');
  const json = await res.json();
  allItems = Array.isArray(json) ? json : [];
  const latest = allItems[0]?.lastChecked || new Date().toISOString();
  document.getElementById('lastUpdated').textContent = formatDate(latest, true);
  render();
}

document.addEventListener('click', async e => {
  const copyValue = e.target?.dataset?.copy;
  if (copyValue) {
    await navigator.clipboard.writeText(copyValue);
    const original = e.target.dataset.label || e.target.textContent || 'Copy';
    e.target.textContent = 'Copied';
    setTimeout(() => e.target.textContent = original, 900);
  }
});

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById('refreshBtn').addEventListener('click', loadData);
document.getElementById('copyVisible').addEventListener('click', async () => {
  const lines = allItems.filter(isStrictFireItem).filter(itemMatchesFilter).map(i => i.address).filter(Boolean).join('\n');
  await navigator.clipboard.writeText(lines);
});

loadData().catch(err => {
  document.getElementById('cards').innerHTML = `<section class="empty">${escapeHtml(err.message)}</section>`;
});
