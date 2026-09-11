function saveMeal(values) {
  return savePlannerRecordFast_('Meals', 'Meal ID', 'MEAL', values);
}

function saveMealBackup(values) {
  values = values || {};
  assertOrganizerFromValues_(values);
  return savePlannerRecordFast_('Meals', 'Meal ID', 'MEAL', values);
}

function deleteMealBackup(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const mealId = String(values.mealId || values['Meal ID'] || '').trim();
  if (!mealId) throw new Error('Meal ID is required.');

  return withPortalMutationLock_(function() {
    const result = deletePlannerRecordFastUnlocked_('Meals', 'Meal ID', mealId);

    if (typeof clearPlannerSocialForItem_ === 'function') {
      clearPlannerSocialForItem_('Meals', mealId);
    }

    return result;
  });
}

function getMealsBackup() {
  ensurePortalSchemaCurrent_();
  return {
    meals: readSheet_('Meals'),
    serverTime: new Date().toISOString()
  };
}
