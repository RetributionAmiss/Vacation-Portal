const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'Travel_Arrivals.gs'),'utf8');
const must=(condition,message)=>{if(!condition) throw new Error(message);};

must(/function\s+travelArrivalReadPlans_\s*\(/.test(server),
  'Travel must use a dedicated reader for time-only values.');
must(/getSpreadsheetTimeZone\(\)/.test(server),
  'Travel clock values must be interpreted in the spreadsheet timezone.');
must(/Utilities\.formatDate\(value,\s*spreadsheetTimeZone,\s*'HH:mm'\)/.test(server),
  'Sheet Date values for Travel times must be returned as literal HH:mm clock values.');
must(/'Departure Time'\s*:\s*true/.test(server)&&/'Arrival Time'\s*:\s*true/.test(server),
  'Both departure and arrival time columns must bypass UTC serialization.');
must(/plans:\s*travelArrivalReadPlans_\(\)/.test(server),
  'Travel API must return timezone-safe plans.');
must(!/function\s+getTravelArrivalData\s*\([^)]*\)\s*\{[\s\S]*?plans:\s*readSheet_\('Travel Plans'\)/.test(server),
  'Travel API must not use the generic UTC-serializing reader for plan clock times.');
must(/'Departure Time':\s*travelArrivalTime_\(values\.departureTime\)/.test(server),
  'Departure time must remain a literal clock value on save.');
must(/'Arrival Time':\s*travelArrivalTime_\(values\.arrivalTime\)/.test(server),
  'Arrival time must remain a literal clock value on save.');

console.log('P3 Travel clock timezone contract passed.');
