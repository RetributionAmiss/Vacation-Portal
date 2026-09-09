function getPlannerSocialData() {
  ensurePortalSchemaCurrent_();

  const travelers = normalizeTravelerRows_(readSheet_('Travelers'));
  const travelerMap = {};
  travelers.forEach(function (traveler) {
    travelerMap[String(traveler['Traveler ID'] || '')] = traveler;
  });

  const signups = readSheet_('Itinerary Signups').map(function (row) {
    const traveler = travelerMap[String(row['Traveler ID'] || '')] || {};
    return Object.assign({}, row, {
      travelerName: String(traveler.Name || row['Traveler ID'] || '')
    });
  });

  const comments = readSheet_('Planner Comments').map(function (row) {
    const traveler = travelerMap[String(row['Traveler ID'] || '')] || {};
    return Object.assign({}, row, {
      travelerName: String(row['Traveler Name'] || traveler.Name || row['Traveler ID'] || '')
    });
  });

  return {
    itinerarySignups: signups,
    plannerComments: comments,
    serverTime: new Date().toISOString()
  };
}

function plannerSocialTraveler_(values) {
  values = values || {};
  const travelerId = String(values.travelerId || '').trim();
  if (!travelerId) throw new Error('Choose your traveler profile first.');

  assertTravelerSelf_(values.deviceId, travelerId);

  const traveler = normalizeTravelerRows_(readSheet_('Travelers')).find(function (row) {
    return String(row['Traveler ID'] || '') === travelerId &&
      String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  if (!traveler) throw new Error('That traveler is not active in this trip.');
  return traveler;
}

function plannerSocialDate_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error('Choose a valid vacation day.');
  return match[1] + '-' + match[2] + '-' + match[3];
}

function plannerSocialTime_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) throw new Error('Choose a time for this activity.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Choose a valid time for this activity.');
  }

  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function plannerSocialRequestedId_(value, prefix) {
  const id = String(value || '').trim().toUpperCase();
  if (!id) return '';
  const expectedPrefix = String(prefix || '').trim().toUpperCase();
  const pattern = new RegExp('^' + expectedPrefix + '-[A-Z0-9]{10}$');
  if (!pattern.test(id)) {
    throw new Error('The planner backup ID is not valid.');
  }
  return id;
}

function plannerSocialItineraryItem_(itineraryId) {
  const id = String(itineraryId || '').trim();
  if (!id) throw new Error('Choose an activity first.');

  const item = readSheet_('Itinerary').find(function (row) {
    return String(row['Itinerary ID'] || '') === id;
  });

  if (!item) throw new Error('That activity could not be found.');
  return item;
}

function saveItineraryInterest(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const travelerId = String(traveler['Traveler ID'] || '');
  const itineraryId = String(values.itineraryId || '').trim();
  const plannedDate = plannerSocialDate_(values.plannedDate);
  const plannedTime = plannerSocialTime_(values.plannedTime);
  const requestedSignupId = plannerSocialRequestedId_(values.signupId, 'SIGNUP');
  const requestId = normalizeMutationRequestId_(values.requestId);
  const scope = 'itinerary-signup-' + itineraryId + '-' + travelerId;

  if (requestId) {
    const cached = readMutationResult_(scope, requestId);
    if (cached) return cached;
  }

  const mutation = withPortalMutationLock_(function() {
    if (requestId) {
      const cached = readMutationResult_(scope, requestId);
      if (cached) return {cached: cached};
    }

    const itinerary = plannerSocialItineraryItem_(itineraryId);
    const now = new Date();
    const existing = readSheet_('Itinerary Signups').find(function (row) {
      return String(row['Itinerary ID'] || '') === itineraryId &&
        String(row['Traveler ID'] || '') === travelerId;
    });

    assertExpectedVersion_(
      values.expectedUpdatedAt,
      existing && existing['Updated At'],
      'Activity signup'
    );

    const signupId = existing
      ? String(existing['Signup ID'] || '')
      : (requestedSignupId || uid_('SIGNUP'));

    const record = {
      'Signup ID': signupId,
      'Itinerary ID': itineraryId,
      'Traveler ID': travelerId,
      'Planned Date': plannedDate,
      'Planned Time': plannedTime,
      'Created At': existing ? existing['Created At'] : now,
      'Updated At': now
    };

    if (existing) {
      updateById_('Itinerary Signups', 'Signup ID', signupId, record);
    } else {
      appendObject_('Itinerary Signups', record);
    }

    return {
      cached: null,
      record: record,
      itinerary: itinerary,
      existed: Boolean(existing)
    };
  });

  if (mutation.cached) return mutation.cached;

  let notification = {
    sent: false,
    reason: mutation.existed ? 'updated-existing-signup' : ''
  };
  if (!mutation.existed) {
    try {
      notification = notifyItineraryInterest_(
        traveler,
        mutation.itinerary,
        mutation.record
      );
    } catch (error) {
      console.warn('Itinerary signup notification failed.', error);
      notification = {sent: false, reason: 'notification-error'};
    }
  }

  const result = {
    signup: Object.assign({}, mutation.record, {
      travelerName: String(traveler.Name || travelerId)
    }),
    notification: notification
  };

  rememberMutationResult_(scope, requestId, result, 1800);
  return result;
}

function removeItineraryInterest(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const travelerId = String(traveler['Traveler ID'] || '');
  const itineraryId = String(values.itineraryId || '').trim();

  return withPortalMutationLock_(function() {
    plannerSocialItineraryItem_(itineraryId);

    const signup = readSheet_('Itinerary Signups').find(function (row) {
      return String(row['Itinerary ID'] || '') === itineraryId &&
        String(row['Traveler ID'] || '') === travelerId;
    });

    if (!signup) {
      return {ok: true, itineraryId: itineraryId, travelerId: travelerId};
    }

    assertExpectedVersion_(
      values.expectedUpdatedAt,
      signup['Updated At'],
      'Activity signup'
    );

    deleteById_('Itinerary Signups', 'Signup ID', signup['Signup ID']);
    return {ok: true, itineraryId: itineraryId, travelerId: travelerId};
  });
}

function savePlannerComment(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const plannerType = String(values.plannerType || '').trim();
  const itemId = String(values.itemId || '').trim();
  const comment = String(values.comment || '').trim().slice(0, 800);
  const requestedCommentId = plannerSocialRequestedId_(values.commentId, 'PCOM');

  if (['Itinerary', 'Meals'].indexOf(plannerType) < 0) {
    throw new Error('Comments are not available for that planning section.');
  }
  if (!itemId) throw new Error('Choose an item first.');
  if (!comment) throw new Error('Write a comment first.');

  const travelerId = String(traveler['Traveler ID'] || '');
  const requestId = normalizeMutationRequestId_(values.requestId);
  const scope = 'planner-comment-' + plannerType + '-' + itemId + '-' + travelerId;

  if (requestId) {
    const cached = readMutationResult_(scope, requestId);
    if (cached) return cached;
  }

  return withPortalMutationLock_(function() {
    if (requestId) {
      const cached = readMutationResult_(scope, requestId);
      if (cached) return cached;
    }

    const sheetName = plannerType === 'Meals' ? 'Meals' : 'Itinerary';
    const idHeader = plannerType === 'Meals' ? 'Meal ID' : 'Itinerary ID';
    const itemExists = readSheet_(sheetName).some(function (row) {
      return String(row[idHeader] || '') === itemId;
    });
    if (!itemExists) throw new Error('That planner item could not be found.');

    const record = {
      'Planner Comment ID': requestedCommentId || uid_('PCOM'),
      'Planner Type': plannerType,
      'Item ID': itemId,
      'Traveler ID': travelerId,
      'Traveler Name': String(traveler.Name || ''),
      'Comment': comment,
      'Created At': new Date()
    };

    appendObject_('Planner Comments', record);

    const result = Object.assign({}, record, {
      travelerName: String(traveler.Name || record['Traveler ID'])
    });
    rememberMutationResult_(scope, requestId, result, 1800);
    return result;
  });
}
