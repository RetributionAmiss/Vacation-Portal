const fs=require('fs');

function assert(condition,message){
  if(!condition){
    console.error('FAIL',message);
    process.exit(1);
  }
}

const source=fs.readFileSync('Client_Planner_Date_Format.html','utf8')
  .replace(/^\s*<script>\s*/,'')
  .replace(/\s*<\/script>\s*$/,'');
const index=fs.readFileSync('AppsScriptIndex.html','utf8');

assert(source.includes("header==='Date'||header==='Due Date'"),'Date and Due Date must use the display formatter');
assert(source.includes("return parts[1]+'/'+parts[2]+'/'+parts[0]"),'planner dates must display as MM/DD/YYYY');
assert(source.includes("plannerDateYmd_(value),'date'"),'date inputs must receive normalized YYYY-MM-DD values');
assert(index.includes("include('Client_Planner_Date_Format')"),'AppsScriptIndex must load planner date formatting');

const build=new Function(
  'plannerDisplayValue_',
  'plannerInput',
  'esc',
  'field',
  source+'\nreturn {plannerDateYmd_,plannerDateDisplay_,plannerDisplayValue_,plannerInput};'
);

const api=build(
  function(name,header,value){return 'BASE:'+String(value||'');},
  function(name,header,value){return 'BASEINPUT:'+String(value||'');},
  function(value){return String(value||'');},
  function(id,label,value,type){return [id,label,value,type].join('|');}
);

assert(api.plannerDateDisplay_('2027-10-02T04:00:00.000Z')==='10/02/2027','ISO timestamp must display as 10/02/2027 without timezone drift');
assert(api.plannerDateDisplay_('2027-01-09')==='01/09/2027','plain ISO date must display with zero-padded month/day');
assert(api.plannerDateYmd_('10/02/2027')==='2027-10-02','MM/DD/YYYY must normalize back to date-input format');
assert(api.plannerDisplayValue_('Meals','Date','2027-10-02T04:00:00.000Z')==='10/02/2027','Meals Date display must use MM/DD/YYYY');
assert(api.plannerDisplayValue_('Budget','Due Date','2027-10-02T04:00:00.000Z')==='10/02/2027','Due Date display must use MM/DD/YYYY');
assert(api.plannerInput('Meals','Date','2027-10-02T04:00:00.000Z').includes('2027-10-02|date'),'editing an ISO planner date must populate the HTML date input correctly');

console.log('PASS planner MM/DD/YYYY date formatting contracts');
