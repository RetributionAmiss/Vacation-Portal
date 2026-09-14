'use strict';
const assert=require('assert');
const {buildSeed,date,timestamp,literal}=require('../scripts/payments_budget_shadow_seed.cjs');
function fixture(){return {tripLegacyId:'TRIP-TEST',timeZone:'America/New_York',rentalIds:['CABIN-A'],travelerIds:['TRV-001'],
 plans:[{'Booking Plan ID':'BOOK-A','Cabin ID':'CABIN-A','Booking Traveler IDs':'TRV-001','Booking Total':100,'Created At':46000.5,'Updated At':46001.5}],
 shares:[{'Share ID':'SHARE-A','Cabin ID':'CABIN-A','Traveler ID':'TRV-001','Source Total':100,'Calculated Share':12.3456,'Adjusted Share':12.35,'Created At':46000.5,'Updated At':46001.5}],
 schedule:[{'Schedule ID':'DUE-A','Cabin ID':'CABIN-A',Label:'Deposit','Amount Due':10,'Due Date':'2027-01-01','Recipient Type':'Agency','Created At':46000.5,'Updated At':46001.5}],
 payments:[{'Payment ID':'PAY-A','Cabin ID':'CABIN-A','Paid By Traveler ID':'TRV-001','Paid To Type':'Agency',Amount:10,'Created At':46000.5,'Updated At':46001.5}],
 budget:[{'Budget ID':'BUDGET-A',Description:'Groceries',Amount:50,'Paid By':'Everyone','Split Between':'Everyone','Include in Rental Split':'Yes'}]};}
const f=fixture(),before=JSON.stringify(f),seed=buildSeed(f);
assert.equal(JSON.stringify(f),before);
assert.equal(seed.preservation[0].sourceValue,12.3456);
assert.equal(seed.preservation[0].normalizedCents,'1235');
assert.equal(seed.report.readyForCutover,false);
assert(!/\b(update|delete|truncate)\b/i.test(seed.sql));
assert(seed.sql.includes('destination_conflict_payments'));
assert(seed.sql.includes('readback_mismatch_payment_shares'));
assert.equal(literal("a'b\\c"),"'a''b\\c'");
assert.throws(()=>literal('a\0b'));
assert.throws(()=>date('2027-02-30'));
assert.throws(()=>date('01/02/2027'));
assert.throws(()=>timestamp('2027-01-01T12:00:00','America/New_York'));
assert(timestamp(46000.5,'America/New_York').includes("AT TIME ZONE 'America/New_York'"));
assert.equal(date(46000.99),"(date '1899-12-30' + 46000)");
for(const mutate of [
 s=>delete s.budget,
 s=>delete s.timeZone,
 s=>s.plans[0]['Created At']='',
 s=>s.payments[0].token='not allowed',
 s=>s.budget[0]['Paid By']='Some name',
 s=>s.shares[0]['Adjusted Share']=1.001,
 s=>s.payments[0]['Paid By Traveler ID']='TRV-UNKNOWN',
 s=>s.payments[0]['Schedule ID']='DUE-UNKNOWN',
 s=>s.travelerIds.push('$guard$'),
 s=>s.budget[0]['Include in Rental Split']='maybe',
 s=>s.schedule[0]['Due Date']='invalid'
]){const s=fixture();mutate(s);assert.throws(()=>buildSeed(s));}
console.log('PASS shadow seed: fidelity, strict identities/dates, source allowlist, conflict gates and non-mutation.');
