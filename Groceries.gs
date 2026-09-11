function saveGrocery(values) {
  return savePlannerRecordFast_('Grocery List', 'Grocery ID', 'GROCERY', values);
}

function getGroceriesBackup() {
  ensurePortalSchemaCurrent_();
  return {
    groceries: readSheet_('Grocery List'),
    serverTime: new Date().toISOString()
  };
}
