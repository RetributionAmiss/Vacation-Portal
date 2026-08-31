const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const client=read('Client_P3_Places_Directions.html');
const styles=read('Styles_P3_Places_Directions.html');
const index=read('AppsScriptIndex.html');

assert(client.includes("P1_VIEW_LABELS_.places='Places'"),'Home navigation must expose Places');
assert(client.includes("home.views.indexOf('places')"),'Places must register under Home hierarchy');
assert(client.includes('detail.Latitude')&&client.includes('detail.Longitude'),'winning rental coordinates must be used when available');
assert(client.includes("String(cabin.Location||'').trim()"),'rental Location must be a fallback when coordinates are absent');
assert(client.includes("String(row.Location||'').trim()"),'itinerary Location must drive activity stops');
assert(client.includes('p3TripActivityGroups_'),'Places must use signed-up activities for the selected day');
assert(client.includes('https://www.google.com/maps/dir/?api=1'),'Directions must use no-key Google Maps universal URLs');
assert(client.includes('https://www.google.com/maps/search/?api=1'),'Map action must use a no-key map search URL');
assert(client.includes("destinations.join('|')"),'day route must include all mapped activity stops as waypoints');
assert(client.includes("origin='+encodeURIComponent(home.destination)"),'day route must begin at selected lodging');
assert(client.includes("destination='+encodeURIComponent(home.destination)"),'day route must return to selected lodging');
assert(client.includes('Location needed before directions can be built.'),'missing locations must be explicit instead of guessed');
assert(client.includes("navigate('itinerary')"),'missing locations must link back to Itinerary for correction');
assert(client.includes("if(currentView==='places')"),'render stack must support the Places view');
assert(!client.includes('AIza'),'Places must not introduce a Google Maps API key');
assert(styles.includes('.p3p-day-strip'),'Places must have a responsive trip-day strip');
assert(styles.includes('@media(max-width:760px)'),'Places must include mobile layout');
assert(index.includes("include('Client_P3_Places_Directions')"),'AppsScriptIndex must load Places client');
assert(index.includes("include('Styles_P3_Places_Directions')"),'AppsScriptIndex must load Places styles');
new Function(scriptBody(client));
console.log('PASS P3 Places and Directions contracts');
