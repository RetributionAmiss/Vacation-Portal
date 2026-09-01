const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};
const script=source=>source.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');

const normalization=read('Client_P3_Planner_Time_Normalization.html');
const travelFormat=read('Client_P3_Travel_Time_Format.html');
const index=read('AppsScriptIndex.html');

must(/p2PlannerTimeLabel_\(value\)/.test(travelFormat),'Travel display must delegate to the shared portal time formatter.');
must(/p3PlannerTimeParts_\(value\)/.test(travelFormat),'Travel time inputs must reuse the shared Sheets-time parser.');
must(/p3TravelArrivalTimeInputValue_/.test(travelFormat),'Travel must normalize stored times for time inputs.');
must(index.includes("include('Client_P3_Travel_Time_Format')"),'Travel time alignment layer must be loaded.');
must(
  index.indexOf("include('Client_P3_Travel_Time_Format')")>index.indexOf("include('Client_P3_Travel_Arrivals')"),
  'Travel time alignment must load after the Travel client.'
);
must(
  index.indexOf("include('Client_P3_Travel_Time_Format')")>index.indexOf("include('Client_P3_Planner_Time_Normalization')"),
  'Travel time alignment must load after shared planner time normalization.'
);

const fields={
  p3TravelDepartureTime:{value:''},
  p3TravelArrivalTime:{value:''}
};
const plan={
  'Departure Time':'1899-12-30T06:05:00.000Z',
  'Arrival Time':'1899-12-30T14:30:00.000Z',
  'Arrival Date':'2026-09-02T00:00:00.000Z'
};
const context={
  console,
  Date,
  String,
  Number,
  p2PlannerTimeLabel_:value=>String(value||''),
  p3TravelArrivalTimeText_:value=>'legacy '+String(value||''),
  p3TravelArrivalSortKey_:()=>'',
  p3TravelArrivalOpenForm_:()=>true,
  p3TravelArrivalSelfId_:()=> 'T1',
  p3TravelArrivalPlanFor_:()=>plan,
  document:{getElementById:id=>fields[id]||null}
};
vm.createContext(context);
vm.runInContext(script(normalization),context);
vm.runInContext(script(travelFormat),context);

must(context.p3TravelArrivalTimeText_('1899-12-30T14:30:00.000Z')==='2:30 PM','Serialized Sheets afternoon time should display like the rest of the portal.');
must(context.p3TravelArrivalTimeText_('00:05')==='12:05 AM','Midnight should use the shared 12-hour display.');
must(context.p3TravelArrivalTimeText_('12:00')==='12:00 PM','Noon should use the shared 12-hour display.');
must(context.p3TravelArrivalTimeInputValue_('1899-12-30T14:30:00.000Z')==='14:30','Serialized Sheets time must normalize to an HTML time input value.');
must(context.p3TravelArrivalSortKey_(plan)==='2026-09-02T14:30','Arrival sorting must use normalized clock time.');

context.p3TravelArrivalOpenForm_();
must(fields.p3TravelDepartureTime.value==='06:05','Edit form must restore normalized departure time.');
must(fields.p3TravelArrivalTime.value==='14:30','Edit form must restore normalized arrival time.');

new Function(script(travelFormat));
console.log('P3 Travel time formatting contract passed.');
