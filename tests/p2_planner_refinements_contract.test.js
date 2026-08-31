const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const client=read('Client_P2_Planner_Refinements.html');
const styles=read('Styles_P2_Planner_Refinements.html');
const index=read('AppsScriptIndex.html');

assert(client.includes("let p22GrocerySortMode_='department'"),'grocery list must default to Store Dept sorting');
assert(client.includes("['department','meal','shopper']"),'grocery list must offer Store Dept, Meal, and Shopper sort modes');
assert(client.includes("if(mode==='meal') return String(row.Category"),'Meal sort must use the existing grocery meal/category field');
assert(client.includes("if(mode==='shopper') return String(row['Assigned To']"),'Shopper sort must use Assigned To');
assert(client.includes("return String(row['Store Section']"),'Store Dept sort must use Store Section');
assert(client.includes('p22-grocery-group-head'),'sorted grocery list must visibly group the active sort field');

assert(client.includes('p2PlannerVacationDates_()'),'meal navigator must derive its days from trip vacation dates');
assert(client.includes('function p22SelectMealDate_'),'meal calendar days must be interactive');
assert(client.includes('p22MealRowsByDate_'),'selected day must filter detailed meal information');
assert(client.includes('Vacation meal calendar'),'meals must expose the vacation-wide calendar strip');
assert(client.includes('The week at a glance'),'meals must include a condensed all-vacation summary');
assert(client.includes("dayRows.map(p22MealDetailCard_)"),'selected day must render its detailed meals');
assert(client.includes("sorted.map(function(row)"),'meal summary must include all planned vacation meals');

assert(styles.includes('.p22-sort-options'),'grocery sort control must have compact styling');
assert(styles.includes('.p22-meal-day-nav'),'meal day navigator must have dedicated responsive styling');
assert(styles.includes('overflow-x:auto'),'vacation day strip must remain usable on narrow phones');
assert(styles.includes('@media(max-width:620px)'),'planner refinements must include mobile-specific layout');

assert(index.includes("include('Client_P2_Planner_Refinements')"),'AppsScriptIndex must load planner refinements after prior client layers');
assert(index.includes("include('Styles_P2_Planner_Refinements')"),'AppsScriptIndex must load planner refinement styles');

new Function(scriptBody(client));
console.log('PASS P2 grocery sorting and meal day navigator contracts');
