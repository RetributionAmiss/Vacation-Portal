const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const config=read('Config.gs');
const server=read('Planner_Social.gs');
const client=read('Client_P2_Planner_Experience.html');
const styles=read('Styles_P2_Planner_Experience.html');
const index=read('AppsScriptIndex.html');
const archive=read('Archive.gs');
const planningCommon=read('Planning_Common.gs');

const schemaMatch=config.match(/PORTAL_SCHEMA_VERSION = '4\.4\.(\d+)'/);
assert(schemaMatch&&Number(schemaMatch[1])>=2,'planner social tables require schema version 4.4.2 or later');
assert(config.includes("'Itinerary Signups'"),'schema must include Itinerary Signups');
assert(config.includes("'Planner Comments'"),'schema must include Planner Comments');
assert(config.includes("'Planned Date'" )&&config.includes("'Planned Time'"),'itinerary signup must store each traveler planned date/time separately');

assert(/function\s+saveItineraryInterest\s*\(/.test(server),'server must expose itinerary interest save');
assert(/function\s+removeItineraryInterest\s*\(/.test(server),'server must expose itinerary interest removal');
assert(/function\s+savePlannerComment\s*\(/.test(server),'server must expose planner comments');
assert(server.includes('assertTravelerSelf_(values.deviceId, travelerId)'),'planner social writes must be bound to the saved traveler device');
assert(server.includes("['Itinerary', 'Meals'].indexOf(plannerType)"),'comments must be limited to supported social planners');
assert(server.includes('notifyItineraryInterest_'),'new itinerary signups must trigger traveler notifications');
assert(server.includes("include_aliases: {external_id: targetIds}"),'signup notification must target traveler identities through OneSignal');
assert(server.includes("String(row['Traveler ID'] || '') !== signerId"),'signup notification must exclude the traveler who just signed up');
assert(server.includes('push-not-configured'),'missing push configuration must not block a traveler signup');

assert(client.includes('I’m interested'),'itinerary card must expose traveler interest action');
assert(client.includes('Who’s going to be there?'),'itinerary must use traveler signup wording');
assert(client.includes('Take me there!'),'event URL must use playful destination wording');
assert(client.includes("paymentMoney_(amount)+' per '+per"),'itinerary cost must display cost and basis as one combined value');
assert(client.includes('Trip chatter'),'itinerary cards must expose comments');
assert(client.includes('saveItineraryInterest'),'client must persist itinerary signup date/time');
assert(client.includes('removeItineraryInterest'),'traveler must be able to remove their signup');
assert(client.includes('p2PlannerCalendarStrip_'),'planner experience must use vacation-day calendar strips');
assert(client.includes('Cooking crew'),'meals must rename Assigned To');
assert(client.includes('Clean up crew'),'meals must rename Clean Up');
assert(client.includes('Notes from the kitchen'),'meals must rename Notes');
assert(client.includes('Requests for the chef'),'meal cards must expose playful comments');
assert(client.includes('quickSetP2GroceryPurchased_'),'grocery Purchased must be a live checkbox action');
assert(client.includes("class=\"p2-grocery-card ${bringing?'is-brought':''}"),'items brought from home must receive distinct card styling');
assert(client.includes("class=\"wide ${bringing?'':'hidden'}\""),'Brought By must be hidden in the edit form unless Bringing is selected');
assert(client.includes('p2-sticky-add'),'planner sections must have a persistent bottom Add action');
assert(client.includes("if(name==='Itinerary') return renderP2Itinerary_()"),'custom itinerary renderer must replace generic tall card');
assert(client.includes("if(name==='Meals') return renderP2Meals_()"),'custom meal renderer must replace generic tall card');
assert(client.includes("if(name==='Grocery List') return renderP2Groceries_()"),'custom grocery renderer must replace generic tall card');

assert(styles.includes('.p2-sticky-add{position:fixed'),'Add action must remain visible while scrolling');
assert(styles.includes('.p2-grocery-card.is-brought'),'brought groceries must use subtle alternate background');
assert(styles.includes('@media(max-width:520px)'),'planner redesign must include narrow-phone layout');

assert(index.includes("include('Client_P2_Planner_Experience')"),'AppsScriptIndex must load planner experience client last');
assert(index.includes("include('Styles_P2_Planner_Experience')"),'AppsScriptIndex must load planner experience styles');
assert(archive.includes("'Itinerary Signups','Planner Comments'"),'full vacation archive must include planner social records');
assert(planningCommon.includes('clearPlannerSocialForItem_'),'deleting itinerary/meals must clear linked social records');

new Function(scriptBody(client));
console.log('PASS P2 itinerary, meals, grocery, comments, signup, and sticky-add contracts');
