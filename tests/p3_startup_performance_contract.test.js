const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};

const server=read('P3_Startup_Performance.gs');
const client=read('Client_P3_Startup_Performance.html');
const index=read('AppsScriptIndex.html');

must(/function getPortalStartupDataPerformanceFocused\(deviceId\)/.test(server),'Fast startup endpoint must exist.');
must(/p3-startup-core-/.test(server)&&/PORTAL_SCHEMA_VERSION/.test(server),'Startup cache must be versioned with the portal schema.');
must(/cache\.put\([\s\S]*120[\s\S]*\)/.test(server),'Lightweight startup cache should last two minutes.');
must(/payload\.trip = getSettings_\('Trip'\)/.test(server),'Trip settings must be refreshed independently of the startup cache.');
must(/getPortalStartupData\(deviceId\)/.test(server),'Cold startup must preserve the existing lightweight startup builder.');
must(/focusPortalPayloadToFinalRental_/.test(server),'Fast startup must preserve finalized-rental filtering.');
must(/addDeviceTravelerBindingToPayload_/.test(server),'Fast startup must preserve saved-device traveler context.');

must(/getPortalStartupDataPerformanceFocused\(PWA_DEVICE_ID_\)/.test(client),'Client refresh must use the performance startup endpoint.');
must(/requestIdleCallback/.test(client)&&/setTimeout\(run,180\)/.test(client),'Full deferred loading must yield to first paint.');
must(/portalDeferredLoadBusy_/.test(client)&&/DATA\.deferredLoaded/.test(client),'Home extras must wait for the main deferred load instead of racing it.');
must(/p3PackingDashboardCard_=function/.test(client)&&/p3StartupPerformancePlaceholder_\('packing'\)/.test(client),'Packing dashboard card must not force an immediate startup read.');
must(/p3TravelArrivalDashboardCard_=function/.test(client)&&/p3StartupPerformancePlaceholder_\('travel'\)/.test(client),'Travel dashboard card must not force an immediate startup read.');
must(/p3ReminderDashboardCard_=function/.test(client)&&/p3StartupPerformancePlaceholder_\('reminders'\)/.test(client),'Reminder dashboard card must not force payment/social reads during first paint.');
must(/p3PackingLoad_\(false\)/.test(client)&&/p3TravelArrivalLoad_\(false\)/.test(client)&&/p3ReminderEnsureSocialData_\(\)/.test(client),'Deferred Home extras must still load after the main trip is ready.');
must(/priorLazy/.test(client)&&/packingItems/.test(client)&&/travelPlans/.test(client),'Soft refresh should preserve already-loaded lazy feature data during lightweight startup.');

must(index.includes("include('Client_P3_Startup_Performance')"),'AppsScriptIndex must load the startup performance layer.');
must(index.indexOf("include('Client_P3_Startup_Performance')")>index.indexOf("include('Client_P3_Travel_Arrivals')"),'Startup performance layer must load after Travel and other Home-card layers.');

const executable=client.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(executable);

console.log('P3 startup performance contract passed.');
