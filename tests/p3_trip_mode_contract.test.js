const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const client=read('Client_P3_Trip_Mode.html');
const styles=read('Styles_P3_Trip_Mode.html');
const index=read('AppsScriptIndex.html');

assert(client.includes("home.views.push('today')"),'Home navigation must expose Today');
assert(client.includes("P1_VIEW_LABELS_.today='Today'"),'Today must have a visible navigation label');
assert(client.includes("P1_VIEW_LABELS_.dashboard='Overview'"),'Home hierarchy must distinguish Overview from Today');
assert(client.includes('p2PlannerVacationDates_'),'Trip Mode must use actual vacation dates');
assert(client.includes('p3TripTodayIso_'),'Trip Mode must compare vacation dates with the current local day');
assert(client.includes("phase==='active'&&date===p3TripTodayIso_()?'TODAY'"),'Trip Mode must identify the real current vacation day');
assert(client.includes('TRIP DAY PREVIEW'),'future trips must remain testable as a day-by-day preview');
assert(client.includes("DATA.itinerarySignups"),'Today must use traveler itinerary signups');
assert(client.includes("String(row['Planned Date']||'').slice(0,10)===date"),'Today activities must filter by planned signup date');
assert(client.includes("navigate('itinerary')"),'Today activity section must link back to Itinerary');
assert(client.includes("navigate('meals')"),'Today meal section must link back to Meals');
assert(client.includes("navigate('groceries')"),'Today grocery section must link back to Grocery List');
assert(client.includes("navigate('rooms')"),'Today lodging section must link back to Room Planner');
assert(client.includes("String(row.Purchased||'No').toLowerCase()!=='yes'"),'Today grocery summary must show outstanding items only');
assert(client.includes("String(row['Cabin ID']||'')===String(cabin['Cabin ID']||'')"),'Today lodging must use the selected rental room assignment');
assert(client.includes("group.id==='home'?'active':''"),'mobile Home must remain active on Today');
assert(client.includes("group.id==='money'?'active':''"),'mobile Money must remain group-aware after Trip Mode override');
assert(styles.includes('.p3-day-strip'),'Trip Mode must have a mobile vacation-day strip');
assert(styles.includes('.p3-today-grid'),'Trip Mode must use responsive daily cards');
assert(styles.includes('@media(max-width:760px)'),'Trip Mode must collapse to one column on phones');
assert(index.includes("include('Client_P3_Trip_Mode')"),'AppsScriptIndex must load Trip Mode client last');
assert(index.includes("include('Styles_P3_Trip_Mode')"),'AppsScriptIndex must load Trip Mode styles');

new Function(scriptBody(client));
console.log('PASS P3 Trip Mode / Today contracts');
