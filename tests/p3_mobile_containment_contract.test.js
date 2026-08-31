const fs = require('fs');
const vm = require('vm');

function read(path){ return fs.readFileSync(path,'utf8'); }
function assert(condition,message){ if(!condition) throw new Error(message); }

const css = read('Styles_P3_Mobile_Containment.html');
const timeClient = read('Client_P3_Planner_Time_Normalization.html');
const index = read('AppsScriptIndex.html');

assert(css.includes('html,body{max-width:100%;overflow-x:hidden}'), 'mobile document overflow containment missing');
assert(css.includes('.p3p-stop-actions{grid-column:2;width:100%;display:grid'), 'Places mobile action containment missing');
assert(css.includes('.p2-card-note{max-width:100%;white-space:normal}'), 'Itinerary long-note containment missing');
assert(css.includes('.p2-calendar-strip,.p22-meal-day-nav,.p3p-day-strip'), 'internal calendar/day strip containment missing');
assert(css.includes('overflow-wrap:anywhere'), 'long mobile text wrapping missing');
assert(index.includes("include('Styles_P3_Mobile_Containment')"), 'mobile containment stylesheet not loaded');
assert(index.includes("include('Client_P3_Planner_Time_Normalization')"), 'planner time normalization client not loaded');

const script = timeClient.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const context = {
  p2PlannerTimeLabel_: value => String(value || '')
};
vm.createContext(context);
vm.runInContext(script, context);

assert(context.p2PlannerTimeLabel_('1899-12-30T17:00:00.000Z') === '5:00 PM', 'Sheets ISO time should render as 5:00 PM');
assert(context.p2PlannerTimeLabel_('12:00') === '12:00 PM', 'noon should render correctly');
assert(context.p2PlannerTimeLabel_('00:30') === '12:30 AM', 'midnight hour should render correctly');

console.log('PASS P3 mobile containment and planner time contracts');
