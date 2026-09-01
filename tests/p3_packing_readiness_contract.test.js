const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};

const config=read('Config.gs');
const server=read('Packing.gs');
const client=read('Client_P3_Packing_Readiness.html');
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

must(index.includes("include('Styles_P3_Packing_Readiness')"),'Packing styles must be loaded by AppsScriptIndex.');
must(index.includes("include('Client_P3_Packing_Readiness')"),'Packing client must be loaded by AppsScriptIndex.');
must(/Packing Items/.test(archive),'Packing data must be included in vacation archive/reset behavior.');
must(/\.p3-pack-item/.test(styles)&&/@media\(max-width:700px\)/.test(styles),'Packing UI must include compact mobile styles.');

const executable=client.replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(executable);

console.log('P3 packing readiness contract passed.');
