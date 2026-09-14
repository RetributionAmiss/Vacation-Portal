'use strict';

// Read-only, credential-free source audit. No database or Sheets writes.
// Inputs must come from one freshly captured trip snapshot, not browser caches.
const DEFINITIONS = {
  plans: {id:'Booking Plan ID', prefix:'BOOK', money:['Booking Total']},
  shares: {id:'Share ID', prefix:'SHARE', money:['Source Total','Calculated Share','Adjusted Share']},
  schedule: {id:'Schedule ID', prefix:'DUE', money:['Amount Due']},
  payments: {id:'Payment ID', prefix:'PAY', money:['Amount']},
  budget: {id:'Budget ID', prefix:'BUDGET', money:['Amount']}
};
function text(value) { return value == null ? '' : String(value).trim(); }
function moneyToCents(value) {
  // Reject currency formatting, unsafe numeric input and sub-cent values.
  // Never silently round a financial migration or coerce NaN to zero.
  if(typeof value==='number' && (!Number.isFinite(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER/100))
    throw new Error('unsafe_money');
  const raw=text(value);
  const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if(!match) throw new Error('invalid_money_precision');
  const cents=BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));
  if(cents>9223372036854775807n) throw new Error('money_overflow');
  return cents;
}
function audit(snapshot) {
  const issues=[], counts={}, totalsCents={}, totalsComplete={}, ids={};
  const issue=(code,domain,row,field)=>issues.push({code,domain,row,field});
  if(!snapshot || typeof snapshot!=='object') throw new Error('snapshot_required');
  if(!/^TRIP-[A-Z0-9-]+$/.test(text(snapshot.tripLegacyId))) issue('invalid_trip','snapshot',0,'tripLegacyId');
  if(!Array.isArray(snapshot.rentalIds)||!snapshot.rentalIds.length) issue('rental_inventory_required','snapshot',0,'rentalIds');
  if(!Array.isArray(snapshot.travelerIds)||!snapshot.travelerIds.length) issue('traveler_inventory_required','snapshot',0,'travelerIds');
  const rentals=new Set(snapshot.rentalIds||[]), travelers=new Set(snapshot.travelerIds||[]);
  for(const [domain,def] of Object.entries(DEFINITIONS)) {
    const rows=snapshot[domain];
    ids[domain]=new Map(); counts[domain]=Array.isArray(rows)?rows.length:0; totalsCents[domain]={}; totalsComplete[domain]={};
    if(!Array.isArray(rows)) { issue('incomplete_snapshot',domain,0,'rows');continue; }
    for(const field of def.money) {totalsCents[domain][field]=0n;totalsComplete[domain][field]=true;}
    rows.forEach((row,index)=>{
      if(!row||typeof row!=='object'||Array.isArray(row)) {issue('invalid_row',domain,index+1,'row');return;}
      const id=text(row[def.id]);
      if(!new RegExp('^'+def.prefix+'-[A-Z0-9]+$').test(id)) issue('invalid_stable_id',domain,index+1,def.id);
      if(ids[domain].has(id)) issue('duplicate_stable_id',domain,index+1,def.id);
      ids[domain].set(id,row);
      if(domain!=='budget'&&!rentals.has(text(row['Cabin ID']))) issue('unresolved_rental',domain,index+1,'Cabin ID');
      for(const field of def.money) {
        try{totalsCents[domain][field]+=moneyToCents(row[field]);}
        catch(error){totalsComplete[domain][field]=false;issue(error.message,domain,index+1,field);}
      }
    });
  }
  const checkTraveler=(value,domain,index,field,required=false)=>{
    const id=text(value);
    if((required&&!id)||(id&&!travelers.has(id))) issue('unresolved_traveler',domain,index+1,field);
  };
  const safeRows=domain=>Array.isArray(snapshot[domain])?snapshot[domain].map(r=>r&&typeof r==='object'&&!Array.isArray(r)?r:{}):[];
  const planCabins=new Set(), sharePairs=new Set();
  safeRows('plans').forEach((row,i)=>{
    const cabin=text(row['Cabin ID']);
    if(planCabins.has(cabin)) issue('duplicate_rental_plan','plans',i+1,'Cabin ID');
    planCabins.add(cabin);
    const members=text(row['Booking Traveler IDs']).split(',').map(text).filter(Boolean);
    if(!members.length) issue('booking_travelers_required','plans',i+1,'Booking Traveler IDs');
    if(new Set(members).size!==members.length) issue('duplicate_booking_traveler','plans',i+1,'Booking Traveler IDs');
    members.forEach(id=>checkTraveler(id,'plans',i,'Booking Traveler IDs',true));
    if(!['Adult','Bedroom'].includes(text(row['Split Basis'])||'Adult')) issue('invalid_split_basis','plans',i+1,'Split Basis');
  });
  safeRows('shares').forEach((row,i)=>{
    checkTraveler(row['Traveler ID'],'shares',i,'Traveler ID',true);
    const pair=text(row['Cabin ID'])+'|'+text(row['Traveler ID']);
    if(sharePairs.has(pair)) issue('duplicate_traveler_share','shares',i+1,'Traveler ID');
    sharePairs.add(pair);
    if(!['Adult','Bedroom'].includes(text(row['Split Basis'])||'Adult')) issue('invalid_split_basis','shares',i+1,'Split Basis');
  });
  safeRows('schedule').forEach((row,i)=>{
    checkTraveler(row['Expected Payer Traveler ID'],'schedule',i,'Expected Payer Traveler ID');
    checkTraveler(row['Recipient Traveler ID'],'schedule',i,'Recipient Traveler ID',text(row['Recipient Type'])==='Traveler');
    if(!['Agency','Traveler'].includes(text(row['Recipient Type']))) issue('invalid_recipient_type','schedule',i+1,'Recipient Type');
  });
  safeRows('payments').forEach((row,i)=>{
    checkTraveler(row['Paid By Traveler ID'],'payments',i,'Paid By Traveler ID',true);
    checkTraveler(row['Paid To Traveler ID'],'payments',i,'Paid To Traveler ID',text(row['Paid To Type'])==='Traveler');
    checkTraveler(row['Confirmed By Traveler ID'],'payments',i,'Confirmed By Traveler ID');
    if(!['Agency','Traveler'].includes(text(row['Paid To Type']))) issue('invalid_recipient_type','payments',i+1,'Paid To Type');
    const scheduleId=text(row['Schedule ID']), schedule=ids.schedule.get(scheduleId);
    if(scheduleId&&(!schedule||text(schedule['Cabin ID'])!==text(row['Cabin ID']))) issue('invalid_schedule_link','payments',i+1,'Schedule ID');
  });
  for(const fields of Object.values(totalsCents)) for(const field of Object.keys(fields)) fields[field]=fields[field].toString();
  return {
    sourceChecksPassed:issues.length===0,
    // Source validation is NOT schema parity, authenticated RLS verification,
    // timestamp conversion, a seed approval, or authorization for a cutover.
    readyForCutover:false,
    counts,totalsCents,totalsComplete,issues
  };
}

function planCalculatedShareNormalization(snapshot) {
  // Explicit proposal only: caller must retain this evidence before any seed.
  // Match DataIntegrity.gs portalMoneyToCents_; do not rebalance other travelers.
  const normalized=JSON.parse(JSON.stringify(snapshot));
  const preservation=[];
  if(!Array.isArray(normalized.shares)) throw new Error('shares_required');
  normalized.shares.forEach(row=>{
    const raw=row['Calculated Share'];
    try { moneyToCents(raw); return; } catch(error) {}
    const value=typeof raw==='number'?raw:Number(text(raw));
    if(!/^\d+(?:\.\d+)?$/.test(text(raw)) || !Number.isFinite(value) || value<0)
      throw new Error('invalid_calculated_share');
    const scaled=value*100;
    const cents=Math.round(scaled+Number.EPSILON*Math.max(1,Math.abs(scaled))*4);
    if(!Number.isSafeInteger(cents)) throw new Error('unsafe_calculated_share');
    preservation.push({shareId:text(row['Share ID']),sourceValue:raw,normalizedCents:String(cents)});
    row['Calculated Share']=(BigInt(cents)/100n).toString()+'.'+(BigInt(cents)%100n).toString().padStart(2,'0');
  });
  return {normalized,preservation,policy:'portalMoneyToCents',applied:false,readyForCutover:false};
}

module.exports={audit,moneyToCents,DEFINITIONS,planCalculatedShareNormalization};

if(require.main===module) {
  try {
    const snapshot=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const result=audit(snapshot);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode=result.sourceChecksPassed?0:1;
  } catch(error) {
    // Don't echo malformed financial inputs or arbitrary exception messages.
    process.stderr.write('Invalid migration snapshot. Expected the documented JSON envelope on stdin.\n');
    process.exitCode=2;
  }
}
