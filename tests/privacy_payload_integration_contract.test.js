'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const pricing=read('PortalPricingPrivacy.gs');
const privacy=read('PortalPrivacy.gs');
const app=read('App.gs');
const startup=read('P3_Startup_Performance.gs');
const paymentPerformance=read('Payments_Performance.gs');
const delta=read('PortalDeltaSync.gs');
const travelersServer=read('Travelers.gs');
const index=read('AppsScriptIndex.html');
const client=read('Client_Privacy_Integration.html');

// Parse the new server/client files as JavaScript before any structural checks.
new Function(pricing);
new Function(privacy);
new Function(client.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,''));

const sandbox={
  Object,Array,String,Number,Boolean,Math,JSON,Date,Error,isFinite
};
vm.createContext(sandbox);
vm.runInContext(pricing,sandbox,{filename:'PortalPricingPrivacy.gs'});
vm.runInContext(privacy,sandbox,{filename:'PortalPrivacy.gs'});

const travelers=[
  {
    'Traveler ID':'TRAV-A','Name':'Alex','Email':'alex@example.com',
    'Group':'Family','Traveler Type':'Adult','Parent/Guardian ID':'',
    Adults:1,Children:0,'Price Cap':400,'Cost %':100,'Pay More':'No',
    'Willing to Share Room':'Yes','Home Location':'Knoxville','Notes':'private A',
    Active:'Yes','Future Secret':'do not expose',parentName:''
  },
  {
    'Traveler ID':'TRAV-B','Name':'Blair','Email':'blair@example.com',
    'Group':'Family','Traveler Type':'Adult','Parent/Guardian ID':'',
    Adults:1,Children:0,'Price Cap':0,'Cost %':100,'Pay More':'Yes',
    'Willing to Share Room':'No','Home Location':'Nashville','Notes':'private B',
    Active:'Yes',parentName:''
  }
];

const payload={
  trip:{'Trip Name':'Privacy Test'},
  travelers,
  cabins:[{
    'Cabin ID':'CAB-1','Cabin Name':'Test Cabin','Total Rental Cost':1000,
    Bedrooms:2,
    bedrooms:[
      {'Bedroom ID':'BED-1','Cabin ID':'CAB-1','Bedroom Name':'Room 1'},
      {'Bedroom ID':'BED-2','Cabin ID':'CAB-1','Bedroom Name':'Room 2'}
    ],
    import:{
      'Import ID':'IMP-1','Original URL':'https://secret.example/listing',
      'Canonical URL':'https://secret.example/canonical','Provider':'Vrbo',
      Status:'Complete','Cabin ID':'CAB-1','Property Name':'Test Cabin',
      Notes:'diagnostic note','Submitted At':'2026-01-01','Updated At':'2026-01-02'
    },
    queue:{
      'Queue ID':'Q-1','Import ID':'IMP-1','Cabin ID':'CAB-1',Provider:'Vrbo',
      Status:'Error',Attempts:5,'Last Error':'raw stack trace',
      'Original URL':'https://secret.example/listing','Created At':'2026-01-01','Updated At':'2026-01-02'
    },
    detail:{
      'Detail ID':'D-1','Cabin ID':'CAB-1','Check In':'4:00 PM',
      'Raw Structured Data':'{sensitive raw provider payload}',
      'Confidence JSON':'{internal model confidence}',
      'Updated At':'2026-01-02'
    }
  }],
  assignments:[
    {'Assignment ID':'A-1','Cabin ID':'CAB-1','Bedroom ID':'BED-1','Traveler ID':'TRAV-A'},
    {'Assignment ID':'A-2','Cabin ID':'CAB-1','Bedroom ID':'BED-2','Traveler ID':'TRAV-B'}
  ],
  budget:[],
  imports:[{
    'Import ID':'IMP-1','Original URL':'https://secret.example/listing',Provider:'Vrbo',
    Status:'Complete','Cabin ID':'CAB-1','Property Name':'Test Cabin',Notes:'internal'
  }],
  importQueue:[{
    'Queue ID':'Q-1','Import ID':'IMP-1','Cabin ID':'CAB-1',Provider:'Vrbo',
    Status:'Error',Attempts:5,'Last Error':'raw failure','Original URL':'https://secret.example/listing'
  }]
};

const sanitized=sandbox.sanitizePortalPayloadForViewer_(payload,'');
assert.strictEqual(sanitized.travelers.length,2);
for(const row of sanitized.travelers){
  for(const field of ['Email','Home Location','Notes','Price Cap','Cost %','Pay More','Future Secret']){
    assert(!Object.prototype.hasOwnProperty.call(row,field),field+' must not cross the shared portal boundary');
  }
}
assert.strictEqual(sanitized.travelerPrivate,null);
assert.deepStrictEqual(Array.from(sanitized.organizerTravelers),[]);

const cabin=sanitized.cabins[0];
assert.strictEqual(cabin.detail['Check In'],'4:00 PM');
assert(!Object.prototype.hasOwnProperty.call(cabin.detail,'Raw Structured Data'));
assert(!Object.prototype.hasOwnProperty.call(cabin.detail,'Confidence JSON'));
assert(!Object.prototype.hasOwnProperty.call(cabin.import,'Original URL'));
assert(!Object.prototype.hasOwnProperty.call(cabin.import,'Notes'));
assert(!Object.prototype.hasOwnProperty.call(cabin.queue,'Last Error'));
assert(!Object.prototype.hasOwnProperty.call(cabin.queue,'Attempts'));
assert(!Object.prototype.hasOwnProperty.call(cabin.queue,'Original URL'));
assert(!Object.prototype.hasOwnProperty.call(sanitized.imports[0],'Original URL'));
assert(!Object.prototype.hasOwnProperty.call(sanitized.importQueue[0],'Last Error'));

assert(sanitized.rentalPricing&&sanitized.rentalPricing['CAB-1'],'shared payload must contain derived rental pricing');
const adultRows=sanitized.rentalPricing['CAB-1'].adult.rows;
const alex=adultRows.find(row=>row.travelerId==='TRAV-A');
const blair=adultRows.find(row=>row.travelerId==='TRAV-B');
assert.strictEqual(alex.amount,400,'derived pricing must honor organizer policy server-side');
assert.strictEqual(blair.amount,600,'derived pricing must redistribute the uncovered share server-side');
for(const row of adultRows){
  for(const field of ['Price Cap','Cost %','Pay More','cap','costPercent','payMore']){
    assert(!Object.prototype.hasOwnProperty.call(row,field),'derived pricing must not reveal raw policy field '+field);
  }
}

// Public endpoints must all pass through the sanitizer.
assert(/function getPortalData\(\)[\s\S]*sanitizePortalPayloadForViewer_/.test(app));
assert(/function getPortalStartupData\(deviceId\)[\s\S]*sanitizePortalPayloadForViewer_/.test(app));
assert(/function getPortalDeferredData\(\)[\s\S]*sanitizePortalPayloadForViewer_/.test(app));
assert(/return sanitizePortalPayloadForViewer_\(payload, deviceId\)/.test(startup),'performance startup endpoint must sanitize its final response');
assert(/p3StartupPerformanceStripDevice_[\s\S]*delete copy\.travelerPrivate[\s\S]*sanitizePortalPayloadForViewer_/.test(startup),'cross-device startup cache must contain shared data only');
assert(/getPortalDeferredDataWithPayments[\s\S]*sanitizePortalPayloadForViewer_\(result, ''\)/.test(paymentPerformance),'payment-bundled deferred load must sanitize portal data');
assert(/sanitizeSharedCabin_/.test(delta),'delta sync must sanitize changed rental records');
assert(/rentalPricing/.test(delta),'delta sync must refresh derived pricing after changed room/cabin data');

// A normal self-save cannot echo organizer-only policy fields back into the browser.
assert(/return organizer\s*\?\s*serializeOrganizerTraveler_\(saved\)\s*:\s*serializeTravelerPrivateProfile_\(saved\)/.test(travelersServer));

// Client integration must be loaded after every legacy/P3 override and hydrate
// private/admin data only through authenticated endpoints.
const privacyInclude=index.indexOf("include('Client_Privacy_Integration')");
const startupInclude=index.indexOf("include('Client_P3_Startup_Performance')");
assert(privacyInclude>startupInclude&&startupInclude>=0,'privacy client integration must load after final startup/client overrides');
assert(/\.getTravelerPrivateProfile\(/.test(client),'self profile editor must lazy-load the authenticated private DTO');
assert(/\.getOrganizerTravelerData\(/.test(client),'traveler administration must lazy-load organizer DTOs');
assert(/privacyOrganizerRowsPresent_/.test(client)&&/saveOrganizerSession_=function/.test(client),'organizer data must be tracked and scrubbed with session state');
assert(/DATA\.rentalPricing/.test(client),'normal rental cost UI must consume derived pricing instead of raw policy fields');
assert(/openBookingPlanForm_=function[\s\S]*privacyLoadOrganizerTravelers_/.test(client),'organizer booking setup must load exact authorized pricing rules before recalculation');
assert(/openPaymentSharesEditor_=function[\s\S]*privacyLoadOrganizerTravelers_/.test(client),'organizer share editor must load exact authorized pricing rules before recalculation');

console.log('privacy_payload_integration_contract.test.js: PASS');
