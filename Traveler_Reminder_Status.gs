const SMART_REMINDER_STATUS_MAX_PREVIEWS_ = 20;

function smartReminderPreviewPayload_(items) {
  const ordered = (items || []).slice().sort(function(a, b) {
    return Number(a.priority || 0) - Number(b.priority || 0);
  });
  const shown = ordered.slice(0, 3);
  let message = shown.map(function(item) { return String(item.line || ''); }).join(' • ');
  if (ordered.length > shown.length) {
    message += ' • Plus ' + (ordered.length - shown.length) + ' more reminder' +
      (ordered.length - shown.length === 1 ? '' : 's') + ' in the portal.';
  }
  message = message.slice(0, 220);

  return {
    title: ordered.length === 1
      ? String(ordered[0].heading || 'Vacation reminder')
      : 'You have ' + ordered.length + ' vacation reminders',
    message: message,
    reminderCount: ordered.length
  };
}

function smartReminderLastDeliveredAt_(ledger) {
  return Object.keys(ledger || {}).reduce(function(latest, key) {
    const value = Number(ledger[key] || 0);
    return value > latest ? value : latest;
  }, 0);
}

function smartReminderDeliveryState_(status) {
  if (!status.enabled) return 'off';
  if (!status.configured) return 'needs-setup';
  if (!status.triggerInstalled) return 'trigger-missing';
  if (status.dueNow > 0) return 'due-now';
  return 'ready';
}

function getTravelerReminderDeliveryStatus(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const apiKey = String(
    PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_API_KEY') || ''
  ).trim();
  const context = {
    trip: trip,
    clock: smartReminderNow_(),
    travelers: smartReminderTravelerMap_()
  };

  const ledger = smartReminderPruneLedger_(smartReminderReadLedger_(), Date.now());
  const allCandidates = [].concat(
    smartReminderPaymentCandidates_(context),
    smartReminderMealCandidates_(context),
    smartReminderActivityCandidates_(context)
  );
  const due = allCandidates.filter(function(item) {
    return !ledger[smartReminderLedgerKey_(item)];
  });

  const byTraveler = {};
  due.forEach(function(item) {
    if (!byTraveler[item.travelerId]) byTraveler[item.travelerId] = [];
    byTraveler[item.travelerId].push(item);
  });

  const previews = Object.keys(byTraveler).map(function(travelerId) {
    const items = byTraveler[travelerId].slice().sort(function(a, b) {
      return Number(a.priority || 0) - Number(b.priority || 0);
    });
    const traveler = context.travelers[travelerId] || {};
    const payload = smartReminderPreviewPayload_(items);
    return {
      travelerId: travelerId,
      travelerName: String(traveler.Name || travelerId),
      title: payload.title,
      message: payload.message,
      reminderCount: payload.reminderCount,
      items: items.map(function(item) {
        return {
          type: String(item.type || ''),
          stage: String(item.stage || ''),
          date: String(item.date || ''),
          heading: String(item.heading || ''),
          line: String(item.line || '')
        };
      })
    };
  }).sort(function(a, b) {
    return String(a.travelerName).localeCompare(String(b.travelerName));
  }).slice(0, SMART_REMINDER_STATUS_MAX_PREVIEWS_);

  const lastDeliveredMs = smartReminderLastDeliveredAt_(ledger);
  const enabled = String(trip['Smart Reminder Push Enabled'] || 'No') === 'Yes';
  const configured = Boolean(appId && apiKey);
  const triggerInstalled = smartReminderTriggerInstalled_();
  const status = {
    enabled: enabled,
    configured: configured,
    appIdConfigured: Boolean(appId),
    apiKeyConfigured: Boolean(apiKey),
    triggerInstalled: triggerInstalled,
    dueNow: due.length,
    travelerPushesDue: previews.length,
    deliveredStagesRecorded: Object.keys(ledger).length,
    lastDeliveredAt: lastDeliveredMs ? new Date(lastDeliveredMs).toISOString() : '',
    generatedAt: new Date().toISOString(),
    timeZone: String(context.clock.timeZone || ''),
    previews: previews
  };
  status.state = smartReminderDeliveryState_(status);
  return status;
}
