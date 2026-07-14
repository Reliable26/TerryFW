import fs from 'fs/promises';

const FIREWATCH_PATH = new URL('../data/firewatch.json', import.meta.url);
const ARCHIVED_PATH = new URL('../data/archived.json', import.meta.url);
const FIREWATCH_VERSION = 'v10-tailored-why-this-matters';
const NOW = new Date();
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

// Use the confirmed public incident report table and filter locally.
// This avoids the earlier problem where the separate fire-only service returned zero records.
const SOURCE_URL = 'https://data.charlottenc.gov/datasets/charlotte::cfd-public-incident-reports-all/explore';
const QUERY_BASE = 'https://gis.charlottenc.gov/arcgis/rest/services/CFD/PublicIncidentReports/MapServer/0/query';
const PAGE_SIZE = 4000;
const MAX_PAGES = 30;

function getField(attrs, names) {
  for (const name of names) {
    if (attrs[name] !== undefined && attrs[name] !== null && attrs[name] !== '') return attrs[name];
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractCode(text) {
  const match = String(text || '').trim().match(/^(\d{3})\b|\b(\d{3})\b/);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function is100FireCode(code) {
  return Number.isInteger(code) && code >= 100 && code <= 199;
}

function classifyProperty(text) {
  const t = String(text || '').toLowerCase();
  if (/apartment|apartments|multi-family|multifamily|multifamily dwelling/.test(t)) return 'Multifamily';
  if (/hotel|motel|extended stay|boarding|rooming/.test(t)) return 'Hospitality';
  if (/hospital|nursing|healthcare|assisted living|rehab|board and care/.test(t)) return 'Healthcare';
  if (/school|college|university|day care/.test(t)) return 'Education';
  if (/warehouse|industrial|shop|store|restaurant|retail|office|commercial|business|mall/.test(t)) return 'Commercial';
  if (/1 or 2 family|one family|two family|single family|residential/.test(t)) return 'Single-Family Strategic';
  if (/brush|woods|grass|vegetation|forest|natural cover/.test(t)) return 'Brush Fire Strategic';
  return 'Needs Property Verification';
}



function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function codeDescription(code, incidentType) {
  const descriptions = {
    100: 'Fire, other',
    111: 'Building fire',
    112: 'Fire in structure other than a building',
    113: 'Cooking fire confined to container',
    114: 'Chimney or flue fire confined to chimney/flue',
    115: 'Incinerator overload or malfunction, fire confined',
    116: 'Fuel burner or boiler malfunction, fire confined',
    117: 'Commercial compactor fire, confined to rubbish',
    118: 'Trash or rubbish fire in structure, no flame damage',
    121: 'Mobile home fire',
    122: 'Motor home or camper fire',
    123: 'Portable building fire',
    131: 'Passenger vehicle fire',
    132: 'Road freight or transport vehicle fire',
    133: 'Rail vehicle fire',
    134: 'Water vehicle fire',
    135: 'Aircraft fire',
    136: 'Self-propelled motor home or RV fire',
    137: 'Camper or RV fire',
    138: 'Off-road vehicle or heavy equipment fire',
    141: 'Forest, woods, or wildland fire',
    142: 'Brush or brush-and-grass fire',
    143: 'Grass fire',
    151: 'Outside rubbish, trash, or waste fire',
    152: 'Garbage dump or sanitary landfill fire',
    153: 'Construction or demolition landfill fire',
    154: 'Dumpster or outside trash receptacle fire',
    155: 'Outside stationary compactor or compacted trash fire',
    161: 'Outside storage fire',
    162: 'Outside equipment fire',
    163: 'Outside gas or vapor combustion explosion',
    164: 'Outside mailbox fire',
    171: 'Cultivated grain or crop fire',
    172: 'Cultivated orchard or vineyard fire',
    173: 'Cultivated trees or nursery stock fire'
  };
  return descriptions[code] || String(incidentType || `Fire code ${code}`);
}

function isTargetPropertyType(propertyType) {
  return ['Multifamily','Hospitality','Healthcare','Education','Commercial'].includes(propertyType);
}

function buildRecommendedServices({ code, propertyType, propertyLoss, contentsLoss }) {
  const services = new Set();
  const loss = Number(propertyLoss || 0) + Number(contentsLoss || 0);
  const target = isTargetPropertyType(propertyType);

  if ([111,112,123].includes(code)) {
    ['Fire Restoration','Smoke Cleaning','Water Mitigation','Reconstruction','Interior Build Back'].forEach(s => services.add(s));
    if (target) services.add('Commercial Reconstruction');
  } else if (code === 113) {
    ['Smoke Cleaning','Odor Control','Water Mitigation Review','Cabinet / Finish Repair Review','Interior Build Back'].forEach(s => services.add(s));
  } else if (code === 114) {
    ['Smoke Cleaning','Chimney / Flue Damage Review','Roofing / Flashing Review','Water Intrusion Investigation','Exterior Repair Review'].forEach(s => services.add(s));
  } else if (code === 116) {
    ['Smoke Cleaning','Mechanical Room Cleaning','Fire Restoration','Water Mitigation Review','Interior Build Back'].forEach(s => services.add(s));
  } else if ([117,155].includes(code)) {
    ['Smoke Cleaning','Compactor / Trash Room Cleaning','Exterior Repair Review','Door / Enclosure Repair Review','Odor Control'].forEach(s => services.add(s));
  } else if (code === 118) {
    ['Smoke Cleaning','Odor Control','Interior Cleaning','Drywall / Paint Review'].forEach(s => services.add(s));
  } else if ([141,142,143,151,154,161,162].includes(code)) {
    ['Exterior Damage Review','Smoke Exposure Review','Building Envelope Review','Roofing / Siding Review'].forEach(s => services.add(s));
  } else if ([131,132,138].includes(code)) {
    ['Exterior Damage Review','Smoke Exposure Review','Pavement / Loading Area Cleanup','Building Envelope Review'].forEach(s => services.add(s));
  } else if (code === 163) {
    ['Fire Restoration','Structural Damage Review','Exterior Repair Review','Reconstruction','Water Mitigation Review'].forEach(s => services.add(s));
  } else {
    ['Fire Restoration','Smoke Cleaning','Water Mitigation Review','Reconstruction Review'].forEach(s => services.add(s));
  }

  if (loss > 0) {
    services.add('Insurance Documentation Support');
    services.add('Building Condition Assessment');
  }

  return Array.from(services).slice(0, 8);
}

function buildWhyThisMatters({ code, propertyType, propertyUse, action1, action2, action3, propertyLoss, contentsLoss, address }) {
  const desc = codeDescription(code);
  const target = isTargetPropertyType(propertyType);
  const lossParts = [];
  const pLoss = money(propertyLoss);
  const cLoss = money(contentsLoss);
  if (pLoss) lossParts.push(`reported property loss of ${pLoss}`);
  if (cLoss) lossParts.push(`reported contents loss of ${cLoss}`);
  const lossText = lossParts.length ? ` CFD records also show ${lossParts.join(' and ')}, which increases the chance that repairs, documentation, or follow-up scoping may be needed.` : '';
  const actionText = [action1, action2, action3].filter(Boolean).join('; ');
  const propertyText = propertyUse ? ` The listed property use is ${propertyUse}.` : '';
  const verifyText = address && /block/i.test(address) ? ' Because the source may only provide an address block, verify the exact property before outreach.' : ' Verify the property name and current repair status before outreach.';

  if (code === 111) {
    return `This is a building fire, which is the strongest Firewatch signal because it can involve fire damage, smoke migration, suppression water, contents impact, and interior build-back needs.${propertyText}${lossText} For Reliable Restorations, this is a direct reason to check whether emergency stabilization, mitigation, smoke cleaning, reconstruction, roofing, or exterior repairs are still open.${verifyText}`;
  }
  if (code === 112) {
    return `This fire occurred in a structure other than a main building. That can still create opportunity if the structure supports a commercial, multifamily, school, healthcare, or hospitality operation, especially where smoke, utilities, exterior components, or adjacent buildings were affected.${propertyText}${lossText} This should be reviewed for exterior repairs, cleanup, and possible secondary damage to the main property.${verifyText}`;
  }
  if (code === 113) {
    return `This is a confined cooking fire. These are often smaller than full structure fires, but they can still create smoke odor, residue cleaning, cabinet/finish repairs, hood-area cleaning, and suppression-water review, especially in apartments, hotels, senior living, schools, or commercial kitchens.${propertyText}${lossText} The opportunity is strongest if this address matches a target property or if multiple units/rooms/common areas were affected.${verifyText}`;
  }
  if (code === 114) {
    return `This is a chimney or flue fire. The likely opportunity is less about full reconstruction and more about smoke cleanup, flue/chimney damage review, roofing/flashing impacts, water intrusion risk, and exterior repair around the penetration.${propertyText}${lossText} This is worth checking when the property is multifamily, hospitality, senior housing, or a commercial facility with shared systems.${verifyText}`;
  }
  if (code === 116) {
    return `This is a fuel burner or boiler malfunction with fire confined. Mechanical-room fires can create soot, odor, equipment-room cleanup, utility coordination, and possible wall/ceiling finish repairs. In larger commercial or multifamily properties, even a contained event can affect operations or life-safety systems.${propertyText}${lossText} This is a good reason to verify whether cleanup, documentation, or build-back support is needed.${verifyText}`;
  }
  if ([117,155].includes(code)) {
    return `This is a compactor-related fire. At apartments, retail centers, hotels, or commercial properties, compactor and trash-area fires can damage enclosures, doors, siding, nearby walls, chutes, exterior finishes, and create persistent odor complaints.${propertyText}${lossText} This is a practical exterior/odor-control opportunity even when the fire did not spread into the main building.${verifyText}`;
  }
  if (code === 118) {
    return `This is a trash or rubbish fire inside a structure with no reported flame damage. The likely opportunity is targeted smoke cleaning, odor control, residue removal, drywall/paint review, and documentation rather than full reconstruction.${propertyText}${lossText} This should be prioritized when it involves a target property type or common area where tenant/customer complaints may continue after the incident.${verifyText}`;
  }
  if ([121,122,136,137].includes(code)) {
    return `This is an RV/mobile-home type fire, so it is usually not a core Reliable Restorations commercial target by itself.${propertyText}${lossText} It only matters if public records show building exposure, displacement, investor ownership, or damage to a nearby target property.${verifyText}`;
  }
  if ([131,132,138].includes(code)) {
    return `This is a vehicle or equipment fire. It should only be treated as an opportunity if it occurred at or damaged a target property, loading area, exterior wall, canopy, parking deck, warehouse, or commercial equipment area.${propertyText}${lossText} The likely scope would be smoke exposure review, exterior cleanup, façade/door repair, or pavement/loading-area cleanup rather than interior mitigation.${verifyText}`;
  }
  if ([141,142,143].includes(code)) {
    return `This is a brush/grass/wildland-type fire. It should not be pursued just because a fire occurred; it matters when it threatened or damaged a building, roof edge, siding, fencing, exterior amenities, landscaping, or a target commercial/multifamily property.${propertyText}${lossText} The best follow-up is to confirm whether there was smoke exposure, exterior damage, or building-envelope risk.${verifyText}`;
  }
  if ([151,154].includes(code)) {
    return `This is an outside rubbish/dumpster-type fire. Most of these are low value unless the fire was close enough to damage siding, doors, trash enclosures, compactor areas, windows, roofing, or a commercial/multifamily building exterior.${propertyText}${lossText} This should be treated as a quick verification item rather than a high-priority call unless damage is confirmed.${verifyText}`;
  }
  if ([152,153].includes(code)) {
    return `This is a landfill or construction/demolition debris fire. It can matter when tied to a commercial site, municipal facility, active construction area, or debris-handling operation where cleanup, odor, smoke exposure, or exterior damage may need documentation.${propertyText}${lossText} Verify whether the property owner or site operator has active repair, cleanup, or compliance needs.${verifyText}`;
  }
  if ([161,162].includes(code)) {
    return `This is an outside storage/equipment fire. For commercial, industrial, multifamily, or school properties, these can damage exterior walls, doors, loading areas, storage cages, equipment pads, roofing edges, or building-envelope components.${propertyText}${lossText} This is worth checking for exterior repair, smoke exposure, and cleanup needs.${verifyText}`;
  }
  if (code === 163) {
    return `This is an outside gas or vapor combustion/explosion event. Even outside the building, this can create structural, exterior, utility, door/window, and envelope damage that may require urgent documentation and repair coordination.${propertyText}${lossText} This should be reviewed quickly if it is near a target property or occupied facility.${verifyText}`;
  }

  return `CFD coded this as ${desc}. The opportunity depends on whether the address is tied to a target property and whether there is smoke, water, exterior, utility, or reconstruction impact.${propertyText}${lossText} Use this as a verification lead rather than assuming a full restoration opportunity.${verifyText}`;
}

function scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss }) {
  let score = 20;
  if (['Multifamily','Hospitality','Healthcare','Education','Commercial'].includes(propertyType)) score += 30;
  if (ageDays <= 7) score += 25;
  else if (ageDays <= 30) score += 20;
  else if (ageDays <= 183) score += 10;
  if (Number(propertyLoss) > 0) score += 15;
  if (Number(contentsLoss) > 0) score += 5;
  return Math.min(100, score);
}

function makeOpportunity(feature) {
  const attrs = feature.attributes || {};
  const incidentType = String(getField(attrs, ['IncidentType','INCIDENTTYPE','incidenttype','Incident Type']));
  const code = extractCode(incidentType);
  if (!is100FireCode(code)) return null;

  const incidentDate = normalizeDate(getField(attrs, ['IncidentDate','INCIDENTDATE','incidentdate','AlarmDateTime','ALARMDATETIME']));
  if (!incidentDate) return null;
  const ageDays = Math.floor((NOW - incidentDate) / (24 * 60 * 60 * 1000));
  if (ageDays < 0 || ageDays > 183) return null;

  const address = String(getField(attrs, ['AddressBlock','ADDRESSBLOCK','Address','ADDRESS']) || 'Address not available');
  const propertyUse = String(getField(attrs, ['PropertyUse','PROPERTYUSE','propertyuse']));
  const action1 = String(getField(attrs, ['ActionTaken1','ACTIONTAKEN1','actiontaken1']));
  const action2 = String(getField(attrs, ['ActionTaken2','ACTIONTAKEN2','actiontaken2']));
  const action3 = String(getField(attrs, ['ActionTaken3','ACTIONTAKEN3','actiontaken3']));
  const propertyLoss = getField(attrs, ['PropertyLoss','PROPERTYLOSS','propertyloss']);
  const contentsLoss = getField(attrs, ['ContentsLoss','CONTENTSLOSS','contentsloss']);
  const incidentNumber = String(getField(attrs, ['IncidentNumber','INCIDENTNUMBER','incidentnumber']));
  const dateLoaded = normalizeDate(getField(attrs, ['dateLoaded','DATELOADED','DateLoaded']));
  const combined = [incidentType, propertyUse, action1, action2, action3].join(' | ');
  const propertyType = classifyProperty(combined);
  const opportunityScore = scoreItem({ propertyType, ageDays, propertyLoss, contentsLoss });

  return {
    propertyName: 'Property name not yet verified',
    address: address.includes('Charlotte') ? address : `${address}, Charlotte NC`,
    county: 'Mecklenburg',
    propertyType,
    fireDate: incidentDate.toISOString().slice(0,10),
    sourceTitle: 'Charlotte CFD Public Incident Reports',
    sourceUrl: SOURCE_URL,
    sourceType: 'Public incident data',
    opportunityScore,
    status: ageDays <= 7 ? 'New Fire' : 'Confirmed Fire',
    whyFlagged: `${incidentType}${propertyUse ? ' | ' + propertyUse : ''}${action1 ? ' | ' + action1 : ''}${action2 ? ' | ' + action2 : ''}`,
    whyThisMatters: buildWhyThisMatters({ code, propertyType, propertyUse, action1, action2, action3, propertyLoss, contentsLoss, address }),
    recommendedServices: buildRecommendedServices({ code, propertyType, propertyLoss, contentsLoss }),
    incidentCode: code,
    incidentType,
    incidentNumber,
    propertyLoss: Number(propertyLoss || 0),
    contentsLoss: Number(contentsLoss || 0),
    ageDays,
    dateLoaded: dateLoaded ? dateLoaded.toISOString() : '',
    lastChecked: NOW.toISOString(),
    buildVersion: FIREWATCH_VERSION
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.incidentNumber || ''}|${item.address}|${item.fireDate}|${item.incidentCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Charlotte CFD query failed: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Charlotte CFD query error: ${JSON.stringify(data.error)}`);
  return data;
}

function buildUrl(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    orderByFields: 'IncidentDate DESC',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    f: 'json'
  });
  return `${QUERY_BASE}?${params.toString()}`;
}

async function fetchFireIncidents() {
  const kept = [];
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const data = await fetchJson(buildUrl(offset));
    const features = data.features || [];
    if (!features.length) break;
    scanned += features.length;

    let oldestDate = null;
    for (const feature of features) {
      const attrs = feature.attributes || {};
      const incidentDate = normalizeDate(getField(attrs, ['IncidentDate','INCIDENTDATE','incidentdate']));
      if (incidentDate && (!oldestDate || incidentDate < oldestDate)) oldestDate = incidentDate;

      const incidentType = String(getField(attrs, ['IncidentType','INCIDENTTYPE','incidenttype']));
      const code = extractCode(incidentType);
      if (is100FireCode(code)) kept.push(feature);
    }

    const olderThanSixMonths = oldestDate && (NOW - oldestDate) > SIX_MONTHS_MS;
    if (olderThanSixMonths && kept.length > 0) break;
  }

  console.log(`${FIREWATCH_VERSION}: scanned ${scanned} public incident rows, kept ${kept.length} 100-series fire rows before final filters.`);
  return kept;
}

async function main() {
  const features = await fetchFireIncidents();
  const active = [];
  for (const feature of features) {
    const item = makeOpportunity(feature);
    if (item) active.push(item);
  }
  const clean = dedupe(active).sort((a, b) => new Date(b.fireDate) - new Date(a.fireDate));
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify(clean, null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  console.log(`${FIREWATCH_VERSION}: Firewatch updated. ${clean.length} active. Only accepted codes are 100-199.`);
}

main().catch(async error => {
  console.error(error);
  await fs.writeFile(FIREWATCH_PATH, JSON.stringify([], null, 2));
  await fs.writeFile(ARCHIVED_PATH, JSON.stringify([], null, 2));
  process.exit(1);
});
