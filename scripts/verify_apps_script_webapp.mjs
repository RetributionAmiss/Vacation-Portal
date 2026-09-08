import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const scriptId=String(process.env.APPS_SCRIPT_ID||'').trim();
const deploymentId=String(process.env.APPS_SCRIPT_DEPLOYMENT_ID||'').trim();
const authPath=`${process.env.HOME}/.clasprc.json`;
const configuredWebAppUrl=`https://script.google.com/macros/s/${deploymentId}/exec`;

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

function exportWebAppUrl_(url){
  if(process.env.GITHUB_ENV){
    fs.appendFileSync(process.env.GITHUB_ENV,`APPS_SCRIPT_WEBAPP_URL=${url}\n`);
  }
}

async function verifyPublicWebAppFallback_(){
  // clasp can refresh OAuth credentials in memory even when its persisted
  // access_token remains expired. Confirm the deployment still belongs to the
  // authenticated Apps Script project, then verify the anonymous WEB_APP URL.
  let deployments='';
  try{
    deployments=execFileSync(
      'npx',
      ['--yes','@google/clasp@3.4.0','deployments'],
      {encoding:'utf8',stdio:['ignore','pipe','pipe']}
    );
  }catch(error){
    const stderr=String(error?.stderr||'').slice(0,500);
    throw new Error(`Could not verify Apps Script deployments with refreshed clasp authentication: ${stderr}`);
  }

  if(!deployments.includes(deploymentId)){
    throw new Error('The configured production deployment ID is not present in the authenticated Apps Script project.');
  }

  const probeUrl=`${configuredWebAppUrl}?deploymentPreflight=${Date.now()}`;
  const response=await fetch(probeUrl,{redirect:'follow'});
  const body=await response.text();

  if(!response.ok){
    throw new Error(`Production Web App preflight returned HTTP ${response.status}.`);
  }
  if(body.includes('Sorry, unable to open the file at this time')){
    throw new Error('Production deployment returned the Google Drive unable-to-open page instead of the portal.');
  }
  if(
    !body.includes('Family Vacation Portal') ||
    !body.includes('loadingScreen') ||
    !body.includes('Opening the family portal')
  ){
    throw new Error('Production deployment exists but its anonymous /exec URL did not return the expected portal shell.');
  }

  console.log('Verified production WEB_APP with clasp deployment ownership + anonymous portal preflight.');
  console.log('Apps Script API metadata token was stale, so manifest + live endpoint checks were used for this verification.');
  exportWebAppUrl_(configuredWebAppUrl);
}

const accessToken=accessTokens_(auth).at(-1);
if(!accessToken){
  await verifyPublicWebAppFallback_();
  process.exit(0);
}

const endpoint=`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`;
const response=await fetch(endpoint,{
  headers:{Authorization:`Bearer ${accessToken}`}
});

if(!response.ok){
  const text=await response.text();
  if(response.status===401||response.status===403){
    console.log(`Apps Script metadata API returned ${response.status}; checking with refreshed clasp authentication and the public Web App endpoint instead.`);
    await verifyPublicWebAppFallback_();
    process.exit(0);
  }
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
exportWebAppUrl_(url);
