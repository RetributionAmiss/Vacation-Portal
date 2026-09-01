const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};

const config=read('Config.gs');
const server=read('Travel_Arrivals.gs');
const client=read('Client_P3_Travel_Arrivals.html');
const styles=read('Styles_P3_Travel_Arrivals.html');
const index=read('AppsScriptIndex.html');
const archive=read('Archive.gs');

must(/const PORTAL_SCHEMA_VERSION = '4\.4\.4'/.test(config),'Travel arrival release should bump schema to 4.4.4.');
must(/'Travel Plans': \[/.test(config),'Travel Plans sheet must be declared in SCHEMAS.');
[
  'Travel Plan ID','Traveler ID','Mode','Leaving From','Departure Date','Departure Time',
  'Arrival Date','Arrival Time','Travel Details','Notes','Created At','Updated At'
].forEach(header=>must(config.includes(`'${header}'`),`Travel Plans schema missing ${header}.`));

must(/function getTravelArrivalData\(\)/.test(server),'Travel arrival server must expose lazy read endpoint.');
must(/function saveMyTravelPlan\(values\)/.test(server),'Traveler must be able to save their own travel plan.');
must(/function deleteMyTravelPlan\(values\)/.test(server),'Traveler must be able to delete their own travel plan.');
must((server.match(/assertTravelerSelf_\(values\.deviceId, travelerId\)/g)||[]).length>=2,'Travel plan writes must authenticate the saved-device traveler.');
must(/function travelArrivalPlanForTraveler_/.test(server),'Travel plans must resolve one row per traveler.');
must(/existing = travelArrivalPlanForTraveler_\(travelerId\)/.test(server),'Travel save must upsert the current traveler plan.');
must(/if \(!arrivalDate\) throw new Error\('Choose your estimated arrival date\.'\)/.test(server),'Travel plan must require an arrival date.');
must(/\['Driving', 'Flying', 'Train', 'Other'\]/.test(server),'Travel modes must be allow-listed.');

must(/home\.views\.indexOf\('travel'\)/.test(client),'Travel must register as a Home subview.');
must(/P1_VIEW_LABELS_\.travel='Travel'/.test(client),'Travel Home subview must have a visible label.');
must(/savedDeviceTravelerProfile_/.test(client),'Travel self-service must prefer the traveler saved to the device.');
must(/Who’s arriving when\?/.test(client),'Travel page must expose a family arrival board.');
must(/Still waiting on/.test(client),'Travel board must show travelers who have not shared a plan.');
must(/Driving/.test(client)&&/Flying/.test(client)&&/Train/.test(client),'Travel form must expose practical travel modes.');
must(/p3TravelArrivalSortKey_/.test(client),'Family arrivals must sort by estimated arrival.');
must(/p3PlannerSocialEnsureDevice_/.test(client),'Travel writes must reuse the saved-device identity bridge.');
must(/beginBackgroundSave_\('Travel plan'/.test(client),'Travel save/delete must use the shared background-save indicator.');
must(/if\(index>=0\) DATA\.travelPlans\[index\]=optimistic;\s*else DATA\.travelPlans\.push\(optimistic\)/.test(client),'Travel save must update local data before server persistence.');
must(/closeModal\(\);\s*render\(\);[\s\S]*\.saveMyTravelPlan\(payload\)/.test(client),'Travel save must render immediately before the server call.');
must(/DATA\.travelPlans=previous/.test(client),'Failed travel save/delete must support optimistic rollback.');
must(/p3TravelArrivalConfirmDelete_/.test(client)&&/Delete your travel plan\?/.test(client),'Travel delete must use a traveler-facing portal confirmation.');
must(!/\bconfirm\s*\(/.test(client),'Travel delete must not use the browser-native confirmation dialog.');
must(/DATA\.travelPlans=\(DATA\.travelPlans\|\|\[\]\)\.filter/.test(client),'Travel delete must remove the plan locally immediately.');
must(/closeModal\(\);\s*render\(\);[\s\S]*\.deleteMyTravelPlan/.test(client),'Travel delete must persist after the immediate local update.');
must(/p3-travel-dashboard-card/.test(client),'Home must surface a compact travel-plan summary.');

must(index.includes("include('Styles_P3_Travel_Arrivals')"),'Travel arrival styles must be loaded by AppsScriptIndex.');
must(index.includes("include('Client_P3_Travel_Arrivals')"),'Travel arrival client must be loaded by AppsScriptIndex.');
must(index.indexOf("include('Client_P3_Travel_Arrivals')")>index.indexOf("include('Client_P3_Packing_Optimistic')"),'Travel arrival client should load after packing follow-ups.');
must(/Travel Plans/.test(archive),'Travel plans must be included in vacation archive/reset behavior.');
must(/\.p3-travel-person/.test(styles)&&/@media\(max-width:700px\)/.test(styles),'Travel board must include compact mobile styles.');

const executable=client.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(executable);

console.log('P3 travel and arrival board contract passed.');
