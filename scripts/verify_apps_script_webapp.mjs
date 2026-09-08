import fs from 'node:fs';

const scriptId=String(process.env.APPS_SCRIPT_ID||'').trim();
const deploymentId=String(process.env.APPS_SCRIPT_DEPLOYMENT_ID||'').trim();
const authPath=`${process.env.HOME}/.clasprc.json`;

if(!scriptId) throw new Error('APPS_SCRIPT_ID is required.');
if(!deploymentId) throw new Error('APPS_SCRIPT_DEPLOYMENT_ID is required.');

const auth=JSON.parse(fs.readFileSync(authPath,'utf8'));

function accessTokens_(value,out=[]){
  if(!value||typeof value!=='object') return out;
  for(const [key,child] of Object.entries(value)){
    if(key==='access_token'&&typeof child==='string'&&child.trim()) out.push(child.trim());
    else if(child&&typeof child==='object') accessTokens_(child,out);
  }
  return out;
}

const accessToken=accessTokens_(auth).at(-1);
if(!accessToken){
  throw new Error('Could not find a refreshed clasp access token. Run a clasp API command before this check.');
}

const endpoint=`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`;
const response=await fetch(endpoint,{
  headers:{Authorization:`Bearer ${accessToken}`}
});

if(!response.ok){
  const text=await response.text();
  throw new Error(`Could not inspect Apps Script deployment (${response.status}): ${text.slice(0,300)}`);
}

const deployment=await response.json();
const webApp=(deployment.entryPoints||[]).find((entry)=>entry&&entry.entryPointType==='WEB_APP'&&entry.webApp);

if(!webApp){
  throw new Error(
    'The configured production deployment is not currently a WEB_APP entry point. '+
    'Do not redeploy it with clasp. Create/repair the Web app deployment in the Apps Script UI first.'
  );
}

const config=webApp.webApp.entryPointConfig||{};
const url=String(webApp.webApp.url||'').trim();

if(config.access!=='ANYONE_ANONYMOUS'){
  throw new Error(`Production web app access is ${config.access||'unknown'}; expected ANYONE_ANONYMOUS.`);
}
if(config.executeAs!=='USER_DEPLOYING'){
  throw new Error(`Production web app executes as ${config.executeAs||'unknown'}; expected USER_DEPLOYING.`);
}
if(!url.includes(`/s/${deploymentId}/exec`)){
  throw new Error('Apps Script API returned a WEB_APP entry point with an unexpected URL.');
}

console.log(`Verified Apps Script WEB_APP entry point at version ${deployment.deploymentConfig?.versionNumber||'head'}.`);
console.log('Access: ANYONE_ANONYMOUS; executeAs: USER_DEPLOYING.');

if(process.env.GITHUB_ENV){
  fs.appendFileSync(process.env.GITHUB_ENV,`APPS_SCRIPT_WEBAPP_URL=${url}\n`);
}
