'use strict';
// Offline SQL generator. Never connects, uploads, updates or deletes source data.
const {audit,moneyToCents,DEFINITIONS,planCalculatedShareNormalization}=require('./payments_budget_preflight.cjs');
const HEADERS={
 plans:['Booking Plan ID','Cabin ID','Booking Traveler IDs','Agency Name','Booking Total','Notes','Created At','Updated At','Split Basis'],
 shares:['Share ID','Cabin ID','Traveler ID','Split Basis','Source Total','Calculated Share','Adjusted Share','Notes','Created At','Updated At'],
 schedule:['Schedule ID','Cabin ID','Label','Due Date','Amount Due','Expected Payer Traveler ID','Recipient Type','Recipient Traveler ID','Recipient Name','Notes','Created At','Updated At'],
 payments:['Payment ID','Cabin ID','Schedule ID','Paid By Traveler ID','Paid To Type','Paid To Traveler ID','Paid To Name','Amount','Payment Date','Notes','Created At','Updated At','Confirmation Status','Confirmation Source','Confirmed By Traveler ID','Confirmed At'],
 budget:['Budget ID','Category','Description','Amount','Paid By','Split Method','Date','Split Between','Due Date','Status','Notes','Include in Rental Split']
};
const TABLES={plans:'booking_plans',shares:'payment_shares',schedule:'payment_schedules',payments:'payments',budget:'budget_items'};
function literal(v){if(v==null)return 'NULL';const s=String(v);if(s.includes('\0'))throw Error('nul_not_allowed');return "'"+s.replace(/'/g,"''")+"'";}
function txt(v){return literal(v==null?'':v);}
function date(v){
 if(v==null||v==='')return 'NULL';
 if(typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=2958465)return `(date '1899-12-30' + ${Math.floor(v)})`;
 if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)return `${literal(v)}::date`;
 throw Error('invalid_date');
}
function timestamp(v,zone,required=false){
 if(v==null||v===''){if(required)throw Error('source_timestamp_required');return 'NULL';}
 if(typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=2958465){
 // Sheet serials represent local wall time. Round float noise to milliseconds.
 return `((timestamp '1899-12-30' + ${Math.round(v*86400000)} * interval '1 millisecond') AT TIME ZONE ${literal(zone)})`;
 }
 if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&!isNaN(Date.parse(v)))return `${literal(v)}::timestamptz`;
 throw Error('invalid_timestamp');
}
function buildSeed(snapshot){
 if(!snapshot||!snapshot.timeZone)throw Error('timezone_required');
 try{new Intl.DateTimeFormat('en',{timeZone:snapshot.timeZone});}catch(e){throw Error('invalid_timezone');}
 for(const key of Object.keys(HEADERS)){
  if(!Array.isArray(snapshot[key]))throw Error('incomplete_snapshot');
  for(const row of snapshot[key]){
   if(!row||Object.keys(row).some(k=>!HEADERS[key].includes(k)))throw Error('unexpected_source_column');
   for(const [field,value] of Object.entries(row))if(/ ID$/.test(field)&&value!=null&&String(value)!==String(value).trim())throw Error('padded_reference');
  }
 }
 const normalized=planCalculatedShareNormalization(snapshot);
 const report=audit(normalized.normalized);
 if(!report.sourceChecksPassed)throw Error('source_audit_failed');
 const trip=`(select id from public.trips where legacy_id=${literal(snapshot.tripLegacyId)} and archived_at is null)`;
 const rental=id=>`(select id from public.rentals where trip_id=${trip} and legacy_id=${literal(id)} and archived_at is null)`;
 const traveler=id=>id?`(select id from public.travelers where trip_id=${trip} and legacy_id=${literal(id)} and archived_at is null)`:'NULL';
 const expected=(table,id)=>id?`(select id from seed_${table} where legacy_id=${literal(id)})`:'NULL';
 const sql=['begin;',"set local lock_timeout='5s';","set local statement_timeout='30s';","set local standard_conforming_strings=on;",
 'lock table public.trips,public.rentals,public.travelers in share mode;',
 'lock table public.booking_plans,public.booking_plan_travelers,public.payment_shares,public.payment_schedules,public.payments,public.budget_items,public.budget_item_travelers in share row exclusive mode;'];
 const guard=(condition,message)=>sql.push(`do $guard$ begin if ${condition} then raise exception ${literal(message)}; end if; end $guard$;`);
 guard(`(select count(*) from public.trips where legacy_id=${literal(snapshot.tripLegacyId)} and archived_at is null) <> 1`,'trip_binding_failed');
 for(const [table,ids] of [['rentals',snapshot.rentalIds],['travelers',snapshot.travelerIds]]){
  if(new Set(ids).size!==ids.length)throw Error('duplicate_inventory');
  if(ids.some(id=>typeof id!=='string'||!/^[A-Z]+-[A-Z0-9-]+$/.test(id)))throw Error('invalid_inventory_id');
  guard(`(select coalesce(jsonb_agg(legacy_id order by legacy_id),'[]'::jsonb) from public.${table} where trip_id=${trip} and archived_at is null) <> ${literal(JSON.stringify([...ids].sort()))}::jsonb`,'inventory_changed_'+table);
 }
 const columns={};
 for(const [key,table] of Object.entries(TABLES)){
  sql.push(`create temporary table seed_${table} (like public.${table} including defaults) on commit drop;`);
  for(let i=0;i<snapshot[key].length;i++){
   const r=snapshot[key][i],n=normalized.normalized[key][i];
   const id=r[DEFINITIONS[key].id];
   const fields={id:`coalesce((select id from public.${table} where trip_id=${trip} and legacy_id=${literal(id)} and archived_at is null),gen_random_uuid())`,trip_id:trip,legacy_id:literal(id),created_by:'NULL',version:'1',archived_at:'NULL',source_record:`${literal(JSON.stringify(r))}::jsonb`};
   if(key!=='budget')Object.assign(fields,{rental_id:rental(r['Cabin ID']),created_at:timestamp(r['Created At'],snapshot.timeZone,true),updated_at:timestamp(r['Updated At'],snapshot.timeZone,true)});
   const money=(field)=>moneyToCents(n[field]).toString();
   if(key==='plans')Object.assign(fields,{agency_name:txt(r['Agency Name']),booking_total_cents:money('Booking Total'),notes:txt(r.Notes),split_basis:txt(r['Split Basis'])});
   if(key==='shares'){
    const plan=snapshot.plans.find(p=>p['Cabin ID']===r['Cabin ID']);
    if(!plan)throw Error('share_plan_required');
    Object.assign(fields,{booking_plan_id:expected('booking_plans',plan['Booking Plan ID']),traveler_id:traveler(r['Traveler ID']),split_basis:txt(r['Split Basis']),source_total_cents:money('Source Total'),calculated_share_cents:money('Calculated Share'),adjusted_share_cents:money('Adjusted Share'),calculated_share_source:`${literal(r['Calculated Share'])}::numeric`,notes:txt(r.Notes)});
   }
   if(key==='schedule'){
    if(!String(r.Label||'').trim())throw Error('schedule_label_required');
    Object.assign(fields,{label:txt(r.Label),due_date:date(r['Due Date']),amount_due_cents:money('Amount Due'),expected_payer_traveler_id:traveler(r['Expected Payer Traveler ID']),recipient_type:txt(r['Recipient Type']),recipient_traveler_id:traveler(r['Recipient Traveler ID']),recipient_name:txt(r['Recipient Name']),notes:txt(r.Notes)});
   }
   if(key==='payments')Object.assign(fields,{schedule_id:expected('payment_schedules',r['Schedule ID']),paid_by_traveler_id:traveler(r['Paid By Traveler ID']),paid_to_type:txt(r['Paid To Type']),paid_to_traveler_id:traveler(r['Paid To Traveler ID']),paid_to_name:txt(r['Paid To Name']),amount_cents:money('Amount'),payment_date:date(r['Payment Date']),notes:txt(r.Notes),confirmation_status:literal(r['Confirmation Status']??null),confirmation_source:literal(r['Confirmation Source']??null),confirmed_by_traveler_id:traveler(r['Confirmed By Traveler ID']),confirmed_at:timestamp(r['Confirmed At'],snapshot.timeZone)});
   if(key==='budget'){
    if(!String(r.Description||'').trim())throw Error('budget_description_required');
    // A conservative shadow seed: no names or groups are guessed into UUIDs.
    if(!['','Everyone'].includes(r['Paid By']||'')||!['','Everyone'].includes(r['Split Between']||''))throw Error('budget_identity_mapping_required');
    const include=String(r['Include in Rental Split']??'').trim().toLowerCase();
    if(!['','yes','no','true','false'].includes(include))throw Error('invalid_include_flag');
    Object.assign(fields,{category:txt(r.Category),description:txt(r.Description),amount_cents:money('Amount'),include_in_rental_split:['yes','true'].includes(include)?'true':'false',paid_by_traveler_id:'NULL',paid_by_text:txt(r['Paid By']),split_between_text:txt(r['Split Between']),split_method:txt(r['Split Method']),legacy_date_text:txt(r.Date),due_date:date(r['Due Date']),status:txt(r.Status),notes:txt(r.Notes)});
   }
   columns[table]=Object.keys(fields);
   sql.push(`insert into seed_${table} (${Object.keys(fields).join(',')}) values (${Object.values(fields).join(',')});`);
  }
  const cols=columns[table]||['id','trip_id','legacy_id'];
  const equal=cols.map(c=>`d.${c} is not distinct from e.${c}`).join(' and ');
  // Reject extra rows, archived conflicts and any drift; never overwrite.
  guard(`exists(select 1 from public.${table} d where d.trip_id=${trip} and not exists(select 1 from seed_${table} e where ${equal}))`,'destination_conflict_'+table);
  sql.push(`insert into public.${table} (${cols.join(',')}) select ${cols.map(c=>'e.'+c).join(',')} from seed_${table} e where not exists(select 1 from public.${table} d where d.id=e.id);`);
  guard(`exists(select 1 from seed_${table} e where not exists(select 1 from public.${table} d where ${equal}))`,'readback_mismatch_'+table);
 }
 sql.push('create temporary table seed_booking_plan_travelers(booking_plan_id uuid,traveler_id uuid) on commit drop;');
 for(const r of snapshot.plans)for(const id of r['Booking Traveler IDs'].split(',').map(s=>s.trim()))sql.push(`insert into seed_booking_plan_travelers values (${expected('booking_plans',r['Booking Plan ID'])},${traveler(id)});`);
 guard(`exists(select 1 from public.booking_plan_travelers d join public.booking_plans p on p.id=d.booking_plan_id where p.trip_id=${trip} and not exists(select 1 from seed_booking_plan_travelers e where e.booking_plan_id=d.booking_plan_id and e.traveler_id=d.traveler_id))`,'booking_travelers_conflict');
 sql.push('insert into public.booking_plan_travelers(booking_plan_id,traveler_id) select e.booking_plan_id,e.traveler_id from seed_booking_plan_travelers e where not exists(select 1 from public.booking_plan_travelers d where e.booking_plan_id=d.booking_plan_id and e.traveler_id=d.traveler_id);');
 guard(`exists(select 1 from public.budget_item_travelers j join public.budget_items b on b.id=j.budget_item_id where b.trip_id=${trip})`,'budget_relationships_conflict');
 sql.push('commit;');
 return {sql:sql.join('\n')+'\n',report,preservation:normalized.preservation};
}
module.exports={buildSeed,date,timestamp,literal,HEADERS};
if(require.main===module){try{const input=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(buildSeed(input).sql);}catch(e){process.stderr.write('Shadow seed rejected: '+e.message+'\n');process.exitCode=1;}}
