const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(root)
  .filter(name=>name.endsWith('.gs'))
  .sort();

const publicFunctions=[];
const suspicious=[];
const forbiddenPublic=new Set([
  'getJustinVotingSummary',
  'processRentalEnrichmentQueue',
  'deletePlannerRecord',
  'deletePlannerRecordFast'
]);

for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const re=/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
  let match;
  while((match=re.exec(text))){
    const name=match[1];
    const params=match[2].split(',').map(v=>v.trim()).filter(Boolean);
    if(name.endsWith('_')) continue;
    publicFunctions.push({file,name,params});

    if(forbiddenPublic.has(name)){
      suspicious.push(`${file}: forbidden public function ${name}`);
    }

    if(params.some(p=>/^(sheetName|idHeader|columnName|range)$/i.test(p))){
      suspicious.push(`${file}: ${name} exposes generic mutation parameter(s): ${params.join(', ')}`);
    }
  }

  const serverJustinPatterns=[
    /function\s+\w+[^]*?\^justin/i,
    /function\s+\w+[^]*?Only Justin/i,
    /requestingTravelerId/i
  ];
  serverJustinPatterns.forEach(pattern=>{
    if(pattern.test(text)){
      suspicious.push(`${file}: contains server-side Justin/Traveler-ID authorization pattern for manual review`);
    }
  });
}

console.log('PUBLIC APPS SCRIPT SURFACE');
for(const item of publicFunctions){
  console.log(`${item.file} :: ${item.name}(${item.params.join(', ')})`);
}

console.log(`\nPublic function count: ${publicFunctions.length}`);

if(suspicious.length){
  console.log('\nAUDIT FLAGS');
  [...new Set(suspicious)].forEach(item=>console.log(`FLAG ${item}`));
}else{
  console.log('\nNo forbidden/generic public-surface flags detected.');
}

if(suspicious.some(item=>/forbidden public|generic mutation parameter/.test(item))){
  process.exitCode=1;
}
