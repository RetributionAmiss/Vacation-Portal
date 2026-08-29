const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'Payments_Confirmation.gs'),'utf8');
const paymentClient=fs.readFileSync(path.join(root,'Client_P1_Payment_Confirmation.html'),'utf8');
const roomClient=fs.readFileSync(path.join(root,'Client_P1_Room_Planner_Enhancements.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'Styles_P1_Payment_Confirmation_Room.html'),'utf8');
const index=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');

assert(/function\s+setBookingPaymentConfirmation\s*\(values\)/.test(server),'payment confirmation endpoint is missing');
assert(/Confirmation Status/.test(server),'payment confirmation status column is missing');
assert(/Confirmation Source/.test(server),'payment confirmation source column is missing');
assert(/Confirmed By Traveler ID/.test(server),'confirmed traveler audit column is missing');
assert(/Confirmed At/.test(server),'confirmation timestamp column is missing');
assert(/assertTravelerSelf_\s*\(values\.deviceId,\s*recipientId\)/.test(server),'recipient confirmation must use saved-device traveler authorization');
assert(/assertOrganizerFromValues_\s*\(values\)/.test(server),'Organizer confirmation must keep server authorization');
assert(/Agency payments do not use traveler receipt confirmation/.test(server),'agency payments must not be treated as traveler confirmations');
assert(/updateById_\s*\(\s*'Payments'/.test(server),'confirmation must update the payment ledger row');
assert(/writePaymentDataServerCache_/.test(server),'confirmation must refresh the payment server cache');

assert(/savedDeviceTravelerProfile_/.test(paymentClient),'recipient UI must respect the saved device traveler');
assert(/recipientId===String\(currentTravelerId\|\|''\)/.test(paymentClient),'temporary Planning As must not be enough for recipient confirmation');
assert(/Confirm received/.test(paymentClient),'Confirm received action is missing');
assert(/Undo confirmation/.test(paymentClient),'Undo confirmation action is missing');
assert(/!confirmation\.confirmed/.test(paymentClient),'confirmed reimbursements should be locked from normal edit/delete controls');
assert(/paymentConfirmationApplyLocal_/.test(paymentClient),'confirmation must update local payment state optimistically');
assert(/beginBackgroundSave_/.test(paymentClient),'confirmation must persist in the background');
assert(/\.setBookingPaymentConfirmation\s*\(payload\)/.test(paymentClient),'client must call the confirmation endpoint');
assert(paymentClient.indexOf('paymentConfirmationApplyLocal_')<paymentClient.lastIndexOf('.setBookingPaymentConfirmation(payload)'),'visible confirmation must be applied before the server write');

assert(/p1BedroomUndoStack_/.test(roomClient),'Room Planner undo stack is missing');
assert(/p1BedroomRedoStack_/.test(roomClient),'Room Planner redo stack is missing');
assert(/function\s+undoBedroomPlanner_/.test(roomClient),'Room Planner undo action is missing');
assert(/function\s+redoBedroomPlanner_/.test(roomClient),'Room Planner redo action is missing');
assert(/p1BedroomPushUndo_\s*\(\)/.test(roomClient),'Room Planner mutations must capture history');
assert(/Number\(room\.Sleeps\|\|0\)/.test(roomClient),'capacity validation must use each bedroom Sleeps value');
assert(/is-over-capacity/.test(roomClient),'over-capacity room state is missing');
assert(/still unassigned/.test(roomClient),'unassigned traveler warning is missing');
assert(/Save bedroom layout/.test(fs.readFileSync(path.join(root,'Client_Bedroom_Draft.html'),'utf8')),'Room Planner must retain explicit save behavior');

assert(/payment-confirmation-badge/.test(styles),'payment confirmation badge styles are missing');
assert(/p1-bedroom-history-actions/.test(styles),'Room Planner undo/redo styles are missing');
assert(/p1-bedroom-validation/.test(styles),'Room Planner validation styles are missing');
assert(/native-bedroom-room\.is-over-capacity/.test(styles),'over-capacity room styles are missing');

assert(/include\('Client_P1_Payment_Confirmation'\)/.test(index),'payment confirmation client is not loaded');
assert(/include\('Client_P1_Room_Planner_Enhancements'\)/.test(index),'Room Planner P1 client is not loaded');
assert(/include\('Styles_P1_Payment_Confirmation_Room'\)/.test(index),'P1 payment/room styles are not loaded');

for(const source of [paymentClient,roomClient]){
  const js=source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
  new Function(js);
}

console.log('PASS P1 payment confirmation and Room Planner contracts');
