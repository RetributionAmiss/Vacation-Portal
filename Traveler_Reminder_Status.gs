const SMART_REMINDER_STATUS_MAX_PREVIEWS_ = 20;

function smartReminderLastDeliveredAt_(ledger) {
  return Object.keys(ledger || {}).reduce(function(latest, key) {
    const value = Number(ledger[key] || 0);
    return value > latest ? value : latest;
  }, 0);
}

function smartReminderStatusLastRun_(context) {
  const raw = smartReminderReadRunStatus_();
  if (!raw || !raw.ranAt) return null;

  return {
    ranAt: String(raw.ranAt || ''),
    outcome: String(raw.outcome || ''),
    enabled: Boolean(raw.enabled),
    configured: Boolean(raw.configured),
    sent: Number(raw.sent || 0),
    reminders: Number(raw.reminders || 0),
    considered: Number(raw.considered || 0),
    attemptedPushes: Number(raw.attemptedPushes || 0),
    failedPushes: Number(raw.failedPushes || 0),
    failures: (Array.isArray(raw.failures) ? raw.failures : []).slice(0, 20).map(function(failure) {
      const travelerId = String(failure && failure.travelerId || '');
      const traveler = context.travelers[travelerId] || {};
      return {
        travelerId: travelerId,
        travelerName: String(traveler.Name || travelerId || 'Traveler'),
        reason: String(failure && failure.reason || 'Delivery failed.').slice(0, 180)
      };
    })
  };
}

function smartReminderDeliveryState_(status) {
  if (!status.enabled) return 'off';
  if (!status.configured) return 'needs-setup';
  if (!status.triggerInstalled) return 'trigger-missing';
  if (status.lastRun && (status.lastRun.outcome === 'failed' || status.lastRun.outcome === 'partial-failure')) {
    return 'delivery-error';
  }
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

  const travelerIds = Object.keys(byTraveler);
  const previews = travelerIds.map(function(travelerId) {
    const items = byTraveler[travelerId].slice().sort(function(a, b) {
      return Number(a.priority || 0) - Number(b.priority || 0);
    });
    const traveler = context.travelers[travelerId] || {};
    const built = smartReminderBuildPushPayload_(context, travelerId, items);
    return {
      travelerId: travelerId,
      travelerName: String(traveler.Name || travelerId),
      title: built.title,
      message: built.message,
      reminderCount: built.count,
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
    wouldSendNow: enabled && configured ? due.length : 0,
    travelerPushesDue: travelerIds.length,
    automaticPushesDue: enabled && configured && triggerInstalled ? travelerIds.length : 0,
    previewTruncated: travelerIds.length > previews.length,
    deliveredStagesRecorded: Object.keys(ledger).length,
    lastDeliveredAt: lastDeliveredMs ? new Date(lastDeliveredMs).toISOString() : '',
    lastRun: smartReminderStatusLastRun_(context),
    generatedAt: new Date().toISOString(),
    timeZone: String(context.clock.timeZone || ''),
    previews: previews
  };
  status.state = smartReminderDeliveryState_(status);
  return status;
}
