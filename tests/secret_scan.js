const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const extensions=new Set(['.gs','.html','.js','.json','.md','.yml','.yaml']);
const ignoredDirs=new Set(['.git','node_modules']);
const findings=[];

const patterns=[
  ['Google API key',/AIza[0-9A-Za-z_-]{30,}/g],
  ['Apify API token',/apify_api_[0-9A-Za-z_-]{20,}/gi],
  ['GitHub token',/gh[pousr]_[0-9A-Za-z]{30,}/g],
  ['OpenAI-style secret',/sk-[0-9A-Za-z_-]{20,}/g],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(ignoredDirs.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){
      walk(full);
      continue;
    }
    if(!extensions.has(path.extname(entry.name).toLowerCase())) continue;

    const rel=path.relative(root,full);
    const text=fs.readFileSync(full,'utf8');
    for(const [label,re] of patterns){
      re.lastIndex=0;
      let match;
      while((match=re.exec(text))){
        findings.push(`${rel}: possible ${label} at character ${match.index}`);
      }
    }

    // Secret property names are expected; literal values in source are not.
    const assignment=/setProperty\(\s*['"](?:GEMINI_API_KEY|APIFY_API_TOKEN|ONESIGNAL_APP_API_KEY|VACATION_PORTAL_EXTENSION_KEY)['"]\s*,\s*['"]([^'"]{8,})['"]\s*\)/g;
    let assignmentMatch;
    while((assignmentMatch=assignment.exec(text))){
      findings.push(`${rel}: hard-coded secret property value`);
    }
  }
}

walk(root);

if(findings.length){
  console.error('FAIL committed-secret scan');
  findings.forEach(item=>console.error('SECRET FLAG '+item));
  process.exit(1);
}

console.log('PASS committed-secret scan');
console.log('NOTE public identifiers such as the OneSignal App ID UUID are not secrets and are intentionally not flagged');
