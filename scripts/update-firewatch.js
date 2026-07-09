import fs from 'fs/promises';

const FIREWATCH_PATH = new URL('../data/firewatch.json', import.meta.url);
const ARCHIVED_PATH = new URL('../data/archived.json', import.meta.url);
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const NOW = new Date();

const CHARLOTTE_CFD_QUERY_URL = 'https://gis.charlottenc.gov/arcgis/rest/services/CFD/PublicIncidentReports/MapServer/0/query?where=1%3D1&outFields=*&orderByFields=IncidentDate%20DESC&resultRecordCount=4000&f=json';
const CHARLOTTE_SOURCE_URL = 'https://data.charlottenc.gov/datasets/cfd-public-incident-reports-fires-only/explore';

const TARGET_TERMS = [
  'apartment', 'apartments', 'multi-family', 'multifamily', 'hotel', 'motel', 'extended stay',
  'assisted living', 'nursing', 'rehabilitation', 'school', 'college', 'university', 'office',
  'store', 'restaurant', 'retail', 'warehouse', 'industrial', 'business', 'commercial', 'shopping'
];

const EXCLUDED_TERMS = [
  'townhouse', 'townhome', 'condominium', 'condo', 'church', 'religious', 'federal', 'state government'
];

const STRATEGIC_SINGLE_FAMILY_TERMS = ['large loss', 'displaced', 'llc', 'investor', 'board', 'reconstruction', 'repair'];

function getField(obj, names) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') return obj[name];
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyProperty(text) {
  const t = text.toLowerCase();
  if (/(apartment|apartments|multi-family|multifamily)/.test(t)) return 'Multifamily';
  if (/(hotel|motel|extended stay)/.test(t)) return 'Hospitality';
  if (/(assisted living|nursing|rehabilitation|hospital|medical)/.test(t)) return 'Healthcare';
  if (/(school|college|university)/.test(t)) return 'Education';
  if (/(warehouse|industrial)/.test(t)) return 'Industrial';
  if (/(office|store|restaurant|retail|shopping|business|commercial)/.test(t)) return 'Commercial';
  if (/(single family|one family|1 family|residential)/.test(t)) return 'Single-Family Strategic';
  if (/(brush|woods|grass|outside vegetation)/.test(t)) return 'Brush Fire Strategic';
  return 'Needs Property Verification';
}

function isExcluded(text) {
  const t = text.toLowerCase();
  return EXCLUDED_TERMS.some(term => t.includes(term));
}

function hasTargetSignal(text) {
  const t = text.toLowerCase();
  return TARGET_TERMS.some(term => t.includes(term));
}

function hasStrategicSignal(text) {
  const t = text.toLowerCase();
  return STRATEGIC_SINGLE_FAMILY_TERMS.some(term => t.includes(term));
}

function scoreItem({ propertyType, ageDays, text, propertyLoss, contentsLoss }) {
  let score = 20;
  if (['Multifamily', 'Hospitality', 'Healthcare', 'Education', 'Commercial', 'Industrial'].includes(propertyType)) score += 25;
  if (ageDays <= 30) score += 20;
  else if (ageDays <= 183) score += 10;
  if (Number(propertyLoss) > 0) score += 10;
  if (Number(contentsLoss) > 0) score += 5;
  if (/displaced|evacuat|two alarm|2 alarm|second alarm|large loss/i.test(text)) score += 15;
  if (/repair|reconstruction|board|demolition|roof|siding|permit/i.test(text)) score += 15;
  if (propertyType.includes('Strategic') && !hasStrategicSignal(text) && !hasTargetSignal(text)) score -= 35;
  return Math.max(0, Math.min(100, score));
}

function buildOpportunity(feature) {
  const attrs = feature.attributes || feature;
  const incidentDate = normalizeDate(getField(attrs, ['IncidentDate', 'incidentdate', 'INCIDENTDATE']));
  if (!incidentDate) return null;

  const incidentType = String(getField(attrs, ['IncidentType', 'incidenttype', 'INCIDENTTYPE']));
  const address = String(getField(attrs, ['AddressBlock', 'addressblock', 'ADDRESSBLOCK', 'Address', 'ADDRESS']));
  const propertyUse = String(getField(attrs, ['PropertyUse', 'propertyuse', 'PROPERTYUSE']));
  const action1 = String(getField(attrs, ['ActionTaken1', 'actiontaken1', 'ACTIONTAKEN1']));
  const action2 = String(getField(attrs, ['ActionTaken2', 'actiontaken2', 'ACTIONTAKEN2']));
  const action3 = String(getField(attrs, ['ActionTaken3', 'actiontaken3', 'ACTIONTAKEN3']));
  const propertyLoss = getField(attrs, ['PropertyLoss', 'propertyloss', 'PROPERTYLOSS']);
  const contentsLoss = getField(attrs, ['ContentsLoss', 'contentsloss', 'CONTENTSLOSS']);
  const incidentNumber = getField(attrs, ['IncidentNumber', 'incidentnumber', 'INCIDENTNUMBER']);

  const text = [incidentType, address, propertyUse, action1, action2, action3].join(' ');
  if (isExcluded(text)) return null;

  const propertyType = classifyProperty(text);
  const ageDays = Math.floor((NOW - incidentDate) / (24 * 60 * 60 * 1000));
  const recent = ageDays <= 183;
  const activeSignal = /repair|reconstruction|board|demolition|closed|reopen|permit|roof|siding|electrical reconnect|temporary power/i.test(text);

  if (!recent && !activeSignal) return {
    archive: true,
    item: makeItem({ incidentDate, address, propertyType, incidentNumber, incidentType, propertyUse, action1, action2, action3, propertyLoss, contentsLoss, ageDays, status: 'Archived' })
  };

  if (propertyType.includes('Strategic') && !hasStrategicSignal(text) && !hasTargetSignal(text)) return null;

  const status = recent ? 'Confirmed Fire' : 'Older But Actionable';
  return { archive: false, item: makeItem({ incidentDate, address, propertyType, incidentNumber, incidentType, propertyUse, action1, action2, action3, propertyLoss, contentsLoss, ageDays, status }) };
}

function makeItem({ incidentDate, address, propertyType, incidentNumber, incidentType, propertyUse, action1, action2, action3, propertyLoss, contentsLoss, ageDays, status }) {
  const text = [incidentType, propertyUse, action1, action2, action3].filter(Boolean).join(' | ');
  const score = scoreItem({ propertyType, ageDays, text, propertyLoss, contentsLoss });
  return {
    id: String(incidentNumber || `${address}-${incidentDate.toISOString()}`),
    propertyName: 'Property name not yet verified',
    address: address || 'Address block not available',
    county: 'Mecklenburg',
    propertyType,
    category: propertyType,
    fireDate: incidentDate.toISOString().slice(0, 10),
    sourceTitle: 'Charlotte CFD Public Incident Reports',
    sourceUrl: CHARLOTTE_SOURCE_URL,
    sourceType: 'Public incident data',
    opportunityScore: score,
    status,
    whyFlagged: text || 'Fire incident record found in public incident data.',
    whyThisMatters: 'A confirmed or fire-adjacent event can create needs for fire restoration, smoke cleaning, water mitigation from suppression activity, reconstruction, roofing, exterior repair, and interior build-back. Exact property details should be verified before outreach.',
    recommendedServices: ['Fire Restoration', 'Smoke Cleaning', 'Water Mitigation', 'Reconstruction', 'Interior Build Back', 'Roofing / Exterior Repair Review'],
    sourceNotes: 'Public incident data may provide an address block rather than an exact address. Property name is not assigned unless verified by another public source.',
    lastChecked: NOW.toISOString()
  };
}

async function fetchCharlotteIncidents() {
  const response = await fetch(CHARLOTTE_CFD_QUERY_URL);
  if (!response.ok) throw new Error(`Charlotte CFD query failed: ${response.status}`);
  const json = await response.json();
  return json.features || [];
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

async function main() {
  const active = [];
  const archived = [];
  try {
    const features = await fetchCharlotteIncidents();
    for (const feature of features) {
      const result = buildOpportunity(feature);
      if (!result) continue;
      if (result.archive) archived.push(result.item);
      else active.push(result.item);
    }
  } catch (error) {
    console.error(error);
  }

  await fs.writeFile(FIREWATCH_PATH, JSON.stringify(dedupe(active), null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify(dedupe(archived), null, 2));
  console.log(`Firewatch updated: ${active.length} active, ${archived.length} archived`);
}

main();
