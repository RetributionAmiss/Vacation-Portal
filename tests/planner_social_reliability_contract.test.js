const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const index=read('AppsScriptIndex.html');
const client=read('Client_P3_Planner_Social_Reliability.html');
const server=read('Planner_Social.gs');

assert(index.includes("vacationDirectWebDeviceIdV1"),'direct Apps Script sessions must receive a persistent browser device ID');
assert(index.includes('window.PWA_DIRECT_DEVICE=true'),'direct deployment mode must be distinguishable from the production PWA host');
assert(index.indexOf('vacationDirectWebDeviceIdV1')<index.indexOf("include('Client_Bootstrap')"),'direct device identity must exist before Client_Bootstrap captures PWA_DEVICE_ID_');
assert(index.includes("include('Client_P3_Planner_Social_Reliability')"),'planner social reliability layer must load last');

assert(client.includes('p3PlannerSocialEnsureDevice_'),'social writes must verify a usable device identity');
assert(client.includes('savedDeviceTravelerProfile_.travelerId'),'direct test binding must use the traveler saved on the device');
assert(client.includes('savedId!==currentId'),'temporary Planning as switching must not silently rebind the direct test device');
assert(client.includes('.saveDeviceTravelerBinding('),'direct test sessions must establish the server-side traveler/device binding before social writes');
assert(client.includes('saveP2ItineraryInterest_=function'),'signup save must use the reliable social write path');
assert(client.includes('removeP2ItineraryInterest_=function'),'signup removal must use the reliable social write path');
assert(client.includes('saveP2PlannerComment_=function'),'planner comments must use the same reliable device path');
assert(client.includes('deviceId:deviceId'),'planner social writes must send the resolved device ID to the server');
assert(server.includes('assertTravelerSelf_(values.deviceId, travelerId)'),'server-side traveler self authorization must remain the security boundary');

new Function(scriptBody(client));
console.log('PASS planner social saves use stable direct-test device identity without weakening traveler authorization');
