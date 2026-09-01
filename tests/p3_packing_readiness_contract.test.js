const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};

const config=read('Config.gs');
const server=read('Packing.gs');
const client=read('Client_P3_Packing_Readiness.html');
const optimistic=read('Client_P3_Packing_Optimistic.html');
const styles=read('Styles_P3_Packing_Readiness.html');
const index=read('AppsScriptIndex.html');
const archive=read('Archive.gs');

must(/const PORTAL_SCHEMA_VERSION = '4\.4\.3'/.test(config),'Packing release should bump schema to 4.4.3.');
must(/'Packing Items': \[/.test(config),'Packing Items sheet must be declared in SCHEMAS.');
[
  'Packing ID','Scope','Owner Traveler ID','Bringing Traveler ID','Category','Item','Quantity','Packed','Notes'
].forEach(header=>must(config.includes(`'${header}'`),`Packing schema missing ${header}.`));

must(/function getPackingData\(\)/.test(server),'Packing server must expose lazy read endpoint.');
must(/function savePackingItem\(values\)/.test(server),'Packing server must expose item save endpoint.');
must(/function togglePackingItem\(values\)/.test(server),'Packing server must expose quick toggle endpoint.');
must(/function deletePackingItem\(values\)/.test(server),'Packing server must expose delete endpoint.');
must((server.match(/assertTravelerSelf_\(values\.deviceId, travelerId\)/g)||[]).length>=3,'All packing writes must authenticate the saved device traveler.');
must(/Only the traveler who added this item can edit it/.test(server),'Packing edit ownership must be enforced server-side.');
must(/Only the person bringing this shared item can check it off/.test(server),'Shared item toggle must respect the assigned bringer.');
must(/scope === 'Personal'[\s\S]*bringingTravelerId = travelerId/.test(server),'Personal items must always belong to the current traveler.');

must(/home\.views\.indexOf\('packing'\)/.test(client),'Packing must register as a Home subview.');
must(/P1_VIEW_LABELS_\.packing='Packing'/.test(client),'Packing Home subview must have a visible label.');
must(/My bag/.test(client)&&/Family shared/.test(client),'Packing must separate personal and shared checklists.');
must(/Who’s bringing it\?/.test(client),'Shared packing form must expose a bringer selector.');
must(/p3PackingGroups_/.test(client)&&/Essentials/.test(client)&&/Toiletries/.test(client),'Packing items must be grouped into practical categories.');
must(/p3PlannerSocialEnsureDevice_/.test(client),'Packing writes must reuse the direct-test/PWA saved-device identity bridge.');
must(/rows\[index\]\.Packed=packed\?'Yes':'No'/.test(client),'Packing checkboxes should update optimistically.');
must(/p3-pack-dashboard-card/.test(client)&&/READY TO GO/.test(client),'Home should surface a compact readiness summary.');
must(/Ready to leave/.test(client),'Packing should expose a traveler readiness state.');

must(/LOCAL-PACK-/.test(optimistic),'New packing items must receive a temporary local ID before server save.');
must(/DATA\.packingItems\.push\(optimisticRow\)/.test(optimistic),'New packing items must appear in local data immediately.');
must(/closeModal\(\);\s*render\(\);[\s\S]*p3PlannerSocialEnsureDevice_/.test(optimistic),'Packing form must close and render before waiting on device/server persistence.');
must(/beginBackgroundSave_\('Packing item'/.test(optimistic),'Packing add/edit must use the shared background-save indicator.');
must(/withSuccessHandler\(function\(result\)[\s\S]*DATA\.packingItems=\(result&&result\.items\)\|\|\[\]/.test(optimistic),'Successful save must reconcile optimistic rows with server data.');
must(/DATA\.packingItems=previousRows/.test(optimistic),'Failed save must roll back the optimistic packing change.');
must(/p3PackingPending_/.test(optimistic)&&/p3PackingCanToggle_/.test(optimistic),'Pending local packing items must block racing checkbox interactions.');
must(/Delete packing item\?/.test(optimistic)&&/Are you sure you want to delete/.test(optimistic),'Packing delete must use clear traveler-facing confirmation copy.');
must(/openModal\(`<div class="p3-pack-delete-confirm">/.test(optimistic),'Packing delete confirmation must use the portal modal instead of the browser confirm dialog.');
must(!/\bconfirm\s*\(/.test(optimistic),'Packing delete must not use the browser-native confirm dialog.');
must(/function p3PackingDeleteNow_\(id\)/.test(optimistic),'Packing delete confirmation must hand off to an explicit optimistic delete action.');
must(/DATA\.packingItems=rows\.filter/.test(optimistic),'Confirmed packing delete must remove the item locally before the server call.');
must(/render\(\);[\s\S]*p3PlannerSocialEnsureDevice_[\s\S]*\.deletePackingItem/.test(optimistic),'Packing delete must render immediately and persist in the background.');
must(/rollbackDelete[\s\S]*DATA\.packingItems=previousRows/.test(optimistic),'Failed packing delete must restore the optimistic row.');

must(index.includes("include('Styles_P3_Packing_Readiness')"),'Packing styles must be loaded by AppsScriptIndex.');
must(index.includes("include('Client_P3_Packing_Readiness')"),'Packing client must be loaded by AppsScriptIndex.');
must(index.includes("include('Client_P3_Packing_Optimistic')"),'Optimistic packing layer must be loaded after the packing client.');
must(index.indexOf("include('Client_P3_Packing_Optimistic')")>index.indexOf("include('Client_P3_Packing_Readiness')"),'Optimistic packing layer must load after the base packing client.');
must(/Packing Items/.test(archive),'Packing data must be included in vacation archive/reset behavior.');
must(/\.p3-pack-item/.test(styles)&&/@media\(max-width:700px\)/.test(styles),'Packing UI must include compact mobile styles.');

const executable=client.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
const optimisticExecutable=optimistic.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(executable);
new Function(optimisticExecutable);

console.log('P3 packing readiness contract passed.');
