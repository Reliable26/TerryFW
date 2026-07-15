const FIRE_CODE_MIN = 100;
const FIRE_CODE_MAX = 199;
let allItems = [];
let currentFilter = 'All';
let currentSort = 'date-desc';
let currentCode = 'All';
let searchTerm = '';
let openedItems = new Set();

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

function stableItemId(item) {
  return String(
    item.incidentNumber ||
    item.IncidentNumber ||
    [item.fireDate, item.address, item.incidentCode, item.sourceUrl].filter(Boolean).join('|')
  );
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

function itemMatchesCode(item) {
  if (currentCode === 'All') return true;
  return String(parseCode(item)) === String(currentCode);
}

function itemMatchesSearch(item) {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return true;
  const text = [
    item.propertyName,
    item.address,
    item.county,
    item.propertyType,
    item.fireDate,
    item.status,
    item.sourceTitle,
    item.sourceType,
    item.whyFlagged,
    item.whyThisMatters,
    item.incidentCode,
    item.incidentType,
    item.incidentNumber
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(q);
}

function sortItems(items) {
  const getDate = item => {
    const n = new Date(item.fireDate || 0).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const getScore = item => Number(item.opportunityScore || 0);
  const getCode = item => Number(parseCode(item) || 0);
  const getAddress = item => String(item.address || '').toLowerCase();
  const getProperty = item => String(item.propertyType || '').toLowerCase();

  return [...items].sort((a, b) => {
    if (currentSort === 'date-asc') return getDate(a) - getDate(b);
    if (currentSort === 'score-desc') return getScore(b) - getScore(a) || getDate(b) - getDate(a);
    if (currentSort === 'score-asc') return getScore(a) - getScore(b) || getDate(b) - getDate(a);
    if (currentSort === 'code-asc') return getCode(a) - getCode(b) || getDate(b) - getDate(a);
    if (currentSort === 'code-desc') return getCode(b) - getCode(a) || getDate(b) - getDate(a);
    if (currentSort === 'address-asc') return getAddress(a).localeCompare(getAddress(b)) || getDate(b) - getDate(a);
    if (currentSort === 'property-asc') return getProperty(a).localeCompare(getProperty(b)) || getDate(b) - getDate(a);
    return getDate(b) - getDate(a);
  });
}

function recommendedServices(item) {
  const list = item.recommendedServices || ['Fire Restoration','Smoke Cleaning','Water Mitigation','Reconstruction','Interior Build Back','Roofing / Exterior Repair Review'];
  return list.map(s => `<li>${escapeHtml(s)}</li>`).join('');
}

function currentMonthCount(items) {
  const now = new Date();
  return items.filter(item => {
    const d = new Date(item.fireDate || '');
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

function newestFireDate(items) {
  const dates = items.map(item => new Date(item.fireDate || '').getTime()).filter(n => Number.isFinite(n));
  if (!dates.length) return 'None';
  return formatDate(new Date(Math.max(...dates)).toISOString());
}

function updateCodeOptions(cleanItems) {
  const select = document.getElementById('codeSelect');
  const codes = Array.from(new Set(cleanItems.map(parseCode).filter(Boolean))).sort((a, b) => a - b);
  const oldValue = select.value || 'All';
  select.innerHTML = '<option value="All">All 100-series codes</option>' + codes.map(code => `<option value="${code}">${code}</option>`).join('');
  select.value = codes.map(String).includes(String(oldValue)) ? oldValue : 'All';
  currentCode = select.value;
}

function renderDiagnostics(cleanItems, visible) {
  const julyConcern = currentMonthCount(cleanItems) === 0;
  const newest = newestFireDate(cleanItems);
  const socialCount = cleanItems.filter(i => /social/i.test(String(i.sourceType || i.sourceTitle || i.status || ''))).length;
  const codeSummary = Array.from(new Set(cleanItems.map(parseCode).filter(Boolean))).sort((a, b) => a - b).join(', ') || 'None';
  document.getElementById('diagnostics').innerHTML = `
    <div><strong>Visible:</strong> ${visible.length.toLocaleString()} of ${cleanItems.length.toLocaleString()}</div>
    <div><strong>Newest fire date:</strong> ${escapeHtml(newest)}</div>
    <div><strong>Current month records:</strong> ${currentMonthCount(cleanItems).toLocaleString()}${julyConcern ? ' <span class="warning">Source may be lagging or filtering out current-month records.</span>' : ''}</div>
    <div><strong>Social leads:</strong> ${socialCount.toLocaleString()}</div>
    <div><strong>Incident codes loaded:</strong> ${escapeHtml(codeSummary)}</div>
  `;
}

function render() {
  const cleanItems = allItems.filter(isStrictFireItem);
  const filtered = cleanItems.filter(itemMatchesFilter).filter(itemMatchesCode).filter(itemMatchesSearch);
  const visible = sortItems(filtered);

  document.getElementById('activeCount').textContent = cleanItems.length.toLocaleString();
  document.getElementById('highCount').textContent = cleanItems.filter(i => Number(i.opportunityScore || 0) >= 80).length.toLocaleString();
  document.getElementById('olderCount').textContent = cleanItems.filter(i => /older but actionable/i.test(i.status || '')).length.toLocaleString();
  document.getElementById('newestFireDate').textContent = newestFireDate(cleanItems);
  document.getElementById('currentMonthCount').textContent = currentMonthCount(cleanItems).toLocaleString();
  renderDiagnostics(cleanItems, visible);

  const cards = document.getElementById('cards');
  const empty = document.getElementById('empty');
  cards.innerHTML = '';
  empty.hidden = visible.length !== 0;

  for (const item of visible) {
    const itemId = stableItemId(item);
    const wasOpened = openedItems.has(itemId);
    const address = item.address || 'Address not available';
    const code = parseCode(item) || 'Unknown';
    const searchLine = item.propertyName && !/not yet verified/i.test(item.propertyName) ? `${item.propertyName} ${address}` : address;
    const el = document.createElement('details');
    el.className = wasOpened ? 'card opened' : 'card';
    el.dataset.itemId = itemId;
    el.innerHTML = `
      <summary>
        <div>
          <div class="review-state">${wasOpened ? 'Opened this session' : 'Not opened yet'}</div>
          <div class="title">${escapeHtml(item.propertyName || 'Property name not yet verified')}</div>
          <div class="meta">${escapeHtml(address)}</div>
          <div class="meta">${formatDate(item.fireDate)} | Code ${escapeHtml(code)} | ${escapeHtml(item.propertyType || 'Needs Property Verification')} | ${escapeHtml(item.status || 'Confirmed Fire')}</div>
          <div class="copybar">
            <button type="button" data-copy="${escapeHtml(address)}">Copy Address</button>
            <button type="button" data-copy="${escapeHtml(searchLine)}">Copy Search Line</button>
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
          <p class="meta">Incident code: ${escapeHtml(code)}. Incident number: ${escapeHtml(item.incidentNumber || 'Unavailable')}. Public incident data may provide an address block rather than an exact address.</p>
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
  openedItems = new Set();
  const latest = allItems[0]?.lastChecked || new Date().toISOString();
  document.getElementById('lastUpdated').textContent = formatDate(latest, true);
  updateCodeOptions(allItems.filter(isStrictFireItem));
  render();
}

document.addEventListener('click', async e => {
  const copyValue = e.target?.dataset?.copy;
  if (copyValue) {
    const originalLabel = e.target.textContent;
    await navigator.clipboard.writeText(copyValue);
    e.target.textContent = 'Copied';
    setTimeout(() => e.target.textContent = originalLabel, 900);
  }
});

document.addEventListener('toggle', e => {
  if (!e.target?.classList?.contains('card')) return;
  if (!e.target.open) return;
  const id = e.target.dataset.itemId;
  if (!id) return;
  openedItems.add(id);
  e.target.classList.add('opened');
  const state = e.target.querySelector('.review-state');
  if (state) state.textContent = 'Opened this session';
}, true);

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById('sortSelect').addEventListener('change', e => {
  currentSort = e.target.value;
  render();
});

document.getElementById('codeSelect').addEventListener('change', e => {
  currentCode = e.target.value;
  render();
});

document.getElementById('searchBox').addEventListener('input', e => {
  searchTerm = e.target.value || '';
  render();
});

document.getElementById('refreshBtn').addEventListener('click', loadData);
document.getElementById('copyVisible').addEventListener('click', async () => {
  const lines = sortItems(allItems.filter(isStrictFireItem).filter(itemMatchesFilter).filter(itemMatchesCode).filter(itemMatchesSearch))
    .map(i => i.address)
    .filter(Boolean)
    .join('\n');
  await navigator.clipboard.writeText(lines);
});

loadData().catch(err => {
  document.getElementById('cards').innerHTML = `<section class="empty">${escapeHtml(err.message)}</section>`;
});
