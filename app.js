let activeFilter = 'all';
let activeData = [];
let archivedData = [];

const cards = document.getElementById('cards');
const template = document.getElementById('cardTemplate');
const filters = document.querySelectorAll('.filter');
const refreshBtn = document.getElementById('refreshBtn');

async function loadData() {
  const [active, archived] = await Promise.all([
    fetch('data/firewatch.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    fetch('data/archived.json', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
  ]);
  activeData = active;
  archivedData = archived;
  renderStats();
  renderCards();
}

function renderStats() {
  const newest = activeData.map(x => x.lastChecked).filter(Boolean).sort().pop();
  document.getElementById('lastUpdated').textContent = newest ? new Date(newest).toLocaleString() : '--';
  document.getElementById('activeCount').textContent = activeData.length;
  document.getElementById('highCount').textContent = activeData.filter(x => Number(x.opportunityScore) >= 80).length;
  document.getElementById('olderCount').textContent = activeData.filter(x => x.status === 'Older But Actionable').length;
}

function passesFilter(item) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'Archived') return item.status === 'Archived';
  return [item.status, item.propertyType, item.category].includes(activeFilter);
}

function renderCards() {
  cards.innerHTML = '';
  const data = activeFilter === 'Archived' ? archivedData : activeData;
  const filtered = data.filter(passesFilter).sort((a, b) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0));

  if (!filtered.length) {
    cards.innerHTML = '<p class="empty">No matching Firewatch opportunities found.</p>';
    return;
  }

  for (const item of filtered) {
    const node = template.content.cloneNode(true);
    node.querySelector('.propertyName').textContent = item.propertyName || 'Property name not yet verified';
    node.querySelector('.address').textContent = item.address || 'Address not verified';
    node.querySelector('.meta').textContent = `${item.fireDate || 'Date unknown'} | ${item.propertyType || 'Property type unknown'} | ${item.status || 'Needs Verification'}`;
    node.querySelector('.score').textContent = item.opportunityScore ?? 0;
    node.querySelector('.whyFlagged').textContent = item.whyFlagged || 'Needs verification.';
    node.querySelector('.whyThisMatters').textContent = item.whyThisMatters || 'Potential restoration opportunity requires source review.';
    const ul = node.querySelector('.services');
    (item.recommendedServices || []).forEach(service => {
      const li = document.createElement('li');
      li.textContent = service;
      ul.appendChild(li);
    });
    const link = node.querySelector('.sourceLink');
    link.href = item.sourceUrl || '#';
    link.textContent = item.sourceTitle || 'Open source';
    node.querySelector('.sourceNotes').textContent = item.sourceNotes || '';
    const top = node.querySelector('.cardTop');
    const details = node.querySelector('.details');
    top.addEventListener('click', () => { details.hidden = !details.hidden; });
    cards.appendChild(node);
  }
}

filters.forEach(button => {
  button.addEventListener('click', () => {
    filters.forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    renderCards();
  });
});

refreshBtn.addEventListener('click', loadData);
loadData();
