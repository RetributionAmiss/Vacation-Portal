// Shared, deterministic contract for fresh Sheet manifests and Supabase reads.
var PaymentsBudgetContract = (function(){
  const fields={
    plans:['Booking Plan ID','Cabin ID','Booking Traveler IDs','Agency Name','Booking Total','Split Basis','Notes','Created At','Updated At'],
    shares:['Share ID','Cabin ID','Traveler ID','Split Basis','Source Total','Calculated Share','Adjusted Share','Notes','Created At','Updated At'],
    schedule:['Schedule ID','Cabin ID','Label','Due Date','Amount Due','Expected Payer Traveler ID','Recipient Type','Recipient Traveler ID','Recipient Name','Notes','Created At','Updated At'],
    payments:['Payment ID','Cabin ID','Schedule ID','Paid By Traveler ID','Paid To Type','Paid To Traveler ID','Paid To Name','Amount','Payment Date','Notes','Created At','Updated At','Confirmation Status','Confirmation Source','Confirmed By Traveler ID','Confirmed At'],
    budget:['Budget ID','Category','Description','Amount','Paid By','Split Method','Date','Split Between','Due Date','Status','Notes','Include in Rental Split']
  };
  const money=['Booking Total','Source Total','Adjusted Share','Amount Due','Amount'];
  function normalize_(field,value){
    const text=String(value==null?'':value);
    if(money.indexOf(field)>=0){
      if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('invalid_money');
      const parts=text.split('.');const cents=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
      if(!Number.isSafeInteger(cents))throw Error('unsafe_money');return String(cents);
    }
    if(field==='Calculated Share'){
      if(!/^\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('invalid_calculated_share');
      const scaled=Number(text)*100;
      if(!Number.isSafeInteger(Math.round(scaled)))throw Error('unsafe_calculated_share');return String(Number(text));
    }
    if(field==='Booking Traveler IDs')return text.split(',').map(v=>v.trim()).filter(Boolean).sort().join(',');
    if(field==='Split Basis')return text||'Adult';
    if(field==='Include in Rental Split'){
      if(!['','yes','no','true','false','1','0','on','off'].includes(text.toLowerCase()))throw Error('invalid_boolean');
      return ['yes','true','1','on'].includes(text.toLowerCase())?'Yes':'No';
    }
    if(['Date','Due Date','Payment Date'].includes(field)&&text){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)throw Error('invalid_date');
      return text;
    }
    if(/ At$/.test(field)&&text){
      if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)||!Number.isFinite(Date.parse(text)))throw Error('invalid_timestamp');
      return new Date(text).toISOString();
    }
    return text.replace(/\r\n/g,'\n');
  }
  function canonical_(snapshot,rentalId){
    if(!/^CABIN-[A-Z0-9]+$/.test(rentalId||''))throw Error('finalized_rental_required');
    const result={contract:'payments-budget-read-v1',rentalId,domains:{}};
    for(const domain of Object.keys(fields)){
      if(!Array.isArray(snapshot[domain]))throw Error('incomplete_domains');
      const seen=new Set(),idField=fields[domain][0];
      result.domains[domain]=snapshot[domain].map(row=>{
        if(!row||typeof row!=='object')throw Error('invalid_row');
        const id=String(row[idField]||'');if(!id||seen.has(id))throw Error('missing_or_duplicate_id');seen.add(id);
        if(domain!=='budget'&&row['Cabin ID']!==rentalId)throw Error('wrong_rental');
        const output=fields[domain].map(f=>normalize_(f,row[f]));
        if(domain==='shares'&&row['_Calculated Share Cents']!==undefined){
          const scaled=Number(row['Calculated Share'])*100;
          if(String(Math.round(scaled+Number.EPSILON*Math.max(1,Math.abs(scaled))*4))!==String(row['_Calculated Share Cents']))throw Error('calculated_cents_mismatch');
        }
        return output;
      }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
    }
    if(!result.domains.plans.length)throw Error('booking_plan_required');
    return JSON.stringify(result);
  }
  return {fields,canonical:canonical_,normalize:normalize_};
})();
if(typeof globalThis!=='undefined')globalThis.PaymentsBudgetContract=PaymentsBudgetContract;
if(typeof module!=='undefined'&&module.exports)module.exports=PaymentsBudgetContract;
