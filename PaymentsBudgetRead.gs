// Fixed financial read endpoints; never accept table names, identities or SQL.
// These expose the same shared financial fields as existing portal reads.
function paymentsBudgetFreshSnapshot_() {
  const selectedId=finalizedRentalFocusId_();
  if(!selectedId)throw new Error('FINALIZED_RENTAL_REQUIRED');
  const ss=getSpreadsheet_();
  ['Booking Plans','Payment Shares','Payment Schedule','Payments','Budget'].forEach(function(name){
    if(!ss.getSheetByName(name))throw new Error('FINANCIAL_SOURCE_INCOMPLETE');
  });
  const data=filterPaymentDataForFinalRental_(buildPaymentData_(),selectedId);
  data.budget=readSheet_('Budget');
  // Read time is set after the snapshot, never fabricated from the browser clock.
  data.serverTime=new Date().toISOString();
  data.finalizedRentalId=selectedId;
  return data;
}
function getPaymentsBudgetReadManifest() {
  return withPortalMutationLock_(function(){
    const data=paymentsBudgetFreshSnapshot_();
    Object.keys(PaymentsBudgetContract.fields).forEach(function(domain){
      data[domain].forEach(function(row){
        if(Object.keys(row).some(function(key){return PaymentsBudgetContract.fields[domain].indexOf(key)<0;})){
          throw new Error('UNSUPPORTED_SOURCE_COLUMN');
        }
      });
    });
    const canonical=PaymentsBudgetContract.canonical(data,data.finalizedRentalId);
    const fingerprint=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,canonical,Utilities.Charset.UTF_8)
      .map(function(n){return ('0'+((n+256)%256).toString(16)).slice(-2);}).join('');
    const order={};
    Object.keys(PaymentsBudgetContract.fields).forEach(function(domain){
      const idField=PaymentsBudgetContract.fields[domain][0];
      order[domain]=data[domain].map(function(row){return String(row[idField]);});
    });
    return {contract:'payments-budget-read-v1',rentalId:data.finalizedRentalId,fingerprint,order,serverTime:data.serverTime};
  });
}
function getPaymentsBudgetFreshData() {
  return withPortalMutationLock_(function(){return paymentsBudgetFreshSnapshot_();});
}

// A narrowly scoped source for the three remaining payment dependencies.
// This is a read-only snapshot of persisted Sheets rows, not a primary writer.
// It must be taken under the same lock as booking-plan/share/installment saves.
function getFinancialDependencyShadowSource() {
  return withPortalMutationLock_(function(){
    const rentalId=finalizedRentalFocusId_();
    if(!rentalId)throw new Error('FINALIZED_RENTAL_REQUIRED');
    const ss=getSpreadsheet_();
    ['Booking Plans','Payment Shares','Payment Schedule'].forEach(function(name){
      if(!ss.getSheetByName(name))throw new Error('FINANCIAL_DEPENDENCY_SOURCE_MISSING');
    });
    const saved=filterPaymentDataForFinalRental_(buildPaymentData_(),rentalId);
    const result={finalizedRentalId:rentalId};
    ['plans','shares','schedule'].forEach(function(domain){
      if(!Array.isArray(saved[domain]))throw new Error('FINANCIAL_DEPENDENCY_SOURCE_INCOMPLETE');
      const fields=PaymentsBudgetContract.fields[domain];
      saved[domain].forEach(function(row){
        if(!row||Object.keys(row).some(function(key){return fields.indexOf(key)<0;})){
          throw new Error('UNSUPPORTED_FINANCIAL_DEPENDENCY_COLUMN');
        }
        if(row['Cabin ID']!==rentalId)throw new Error('FINANCIAL_DEPENDENCY_WRONG_RENTAL');
      });
      result[domain]=saved[domain];
    });
    result.serverTime=new Date().toISOString();
    return result;
  });
}

// Budget replication needs only persisted Budget rows, not another full financial read.
function getBudgetShadowSource() {
  return withPortalMutationLock_(function(){
    if(!getSpreadsheet_().getSheetByName('Budget'))throw new Error('BUDGET_SOURCE_MISSING');
    const budget=readSheet_('Budget');
    return {budget:budget,serverTime:new Date().toISOString()};
  });
}

// Read only saved payment records for the finalized rental; never browser drafts.
function getPaymentShadowSource(){
  return withPortalMutationLock_(function(){
    const rentalId=finalizedRentalFocusId_();
    if(!rentalId)throw new Error('FINALIZED_RENTAL_REQUIRED');
    if(!getSpreadsheet_().getSheetByName('Payments'))throw new Error('PAYMENT_SOURCE_MISSING');
    const payments=readSheet_('Payments').filter(function(row){return row['Cabin ID']===rentalId;});
    return {payments:payments,finalizedRentalId:rentalId,serverTime:new Date().toISOString()};
  });
}
