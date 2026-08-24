function submitPortalFeedback(feedback) {
  setupVacationPortalSilent_();

  feedback = feedback || {};
  const travelerId = String(feedback.travelerId || '').trim();
  const traveler = readSheet_('Travelers').find(function (row) {
    return String(row['Traveler ID'] || '') === travelerId;
  }) || {};

  const summary = String(feedback.summary || '').trim();
  const whatHappened = String(feedback.whatHappened || '').trim();

  if (!summary && !whatHappened) {
    throw new Error('Please enter a short summary or tell us what happened.');
  }

  const now = new Date();
  const feedbackId = uid_('FEEDBACK');

  appendObject_('Feedback', {
    'Feedback ID': feedbackId,
    'Traveler ID': travelerId,
    'Traveler Name':
      String(feedback.travelerName || traveler.Name || '').trim(),
    'Type': String(feedback.type || 'General feedback').trim(),
    'Summary': summary.slice(0, 1000),
    'What Happened': whatHappened.slice(0, 10000),
    'Expected Result': String(feedback.expectedResult || '').trim().slice(0, 10000),
    'Steps to Reproduce': String(feedback.steps || '').trim().slice(0, 10000),
    'Portal View': String(feedback.portalView || '').trim().slice(0, 250),
    'Page URL': String(feedback.pageUrl || '').trim().slice(0, 4000),
    'Browser': String(feedback.browser || '').trim().slice(0, 2000),
    'Status': 'New',
    'Created At': now,
    'Updated At': now
  });

  return {
    ok: true,
    feedbackId: feedbackId,
    message: 'Thanks — your feedback was added to the portal feedback sheet.'
  };
}

function getPortalLiveActivity(sinceIso) {
  setupVacationPortalSilent_();

  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const sinceTime = isNaN(since.getTime()) ? 0 : since.getTime();

  const newCabins = readSheet_('Cabins')
    .filter(function (row) {
      if (String(row.Active || 'Yes').toLowerCase() === 'no') return false;
      const created = new Date(row['Created At']);
      return !isNaN(created.getTime()) && created.getTime() > sinceTime;
    })
    .map(function (row) {
      return {
        cabinId: row['Cabin ID'] || '',
        name: row.Nickname || row['Cabin Name'] || 'New rental',
        submittedBy: row['Submitted By'] || '',
        provider: row.Provider || '',
        createdAt: row['Created At'] || '',
        imageUrl: row['Image URL'] || ''
      };
    })
    .sort(function (left, right) {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    })
    .slice(-20);

  return {
    newCabins: newCabins,
    serverTime: new Date().toISOString()
  };
}
