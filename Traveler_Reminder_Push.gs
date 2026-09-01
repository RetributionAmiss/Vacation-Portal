const SMART_REMINDER_TRIGGER_HANDLER_ = 'processTravelerReminderPushes_';
const SMART_REMINDER_LEDGER_PROPERTY_ = 'SMART_REMINDER_PUSH_LEDGER_V1';
const SMART_REMINDER_RUN_STATUS_PROPERTY_ = 'SMART_REMINDER_PUSH_STATUS_V1';

function smartReminderPushEnabled_() {
  return String(getSettings_('Trip')['Smart Reminder Push Enabled'] || 'No') === 'Yes';
}

function smartReminderTriggerInstalled_() {
  return ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === SMART_REMINDER_TRIGGER_HANDLER_;
  });
}

function ensureTravelerReminderTrigger_() {
  if (smartReminderTriggerInstalled_()) return {installed: true, created: false};

  ScriptApp.newTrigger(SMART_REMINDER_TRIGGER_HANDLER_)
    .timeBased()
    .everyHours(1)
    .create();

  return {installed: true, created: true};
}

function smartReminderNow_() {
  const now = new Date();
  const timeZone = Session.getScriptTimeZone() || 'America/New_York';
  return {
    date: Utilities.formatDate(now, timeZone, 'yyyy-MM-dd'),
    hour: Number(Utilities.formatDate(now, timeZone, 'H')),
    minute: Number(Utilities.formatDate(now, timeZone, 'm')),
    timeZone: timeZone,
    now: now
  };
}

function smartReminderIsoDate_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
}

function smartReminderDateValue_(iso) {
  const parts = String(iso || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function smartReminderDaysUntil_(today, target) {
  const start = smartReminderDateValue_(today);
  const end = smartReminderDateValue_(target);
  if (!isFinite(start) || !isFinite(end)) return NaN;
  return Math.round((end - start) / 86400000);
}

function smartReminderDateLabel_(iso) {
  const parts = String(iso || '').split('-');
  return parts.length === 3 ? parts[1] + '/' + parts[2] + '/' + parts[0] : String(iso || '');
}

function smartReminderTimeLabel_(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(time || '');
  const hour24 = Number(match[1]);
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  return (((hour24 + 11) % 12) + 1) + ':' + match[2] + ' ' + suffix;
}

function smartReminderNameMatches_(value, name) {
  const text = String(value || '').trim().toLowerCase();
  const full = String(name || '').trim().toLowerCase();
  if (!text || !full) return false;
  if (text === full || text.indexOf(full) >= 0) return true;
  const first = full.split(/\s+/)[0];
  return text.split(/[,;&/+]|\band\b/i).map(function(part) {
    return part.trim();
  }).some(function(part) {
    return part === full || part === first;
  });
}

function smartReminderTravelerMap_() {
  const map = {};
  normalizeTravelerRows_(readSheet_('Travelers')).forEach(function(traveler) {
    if (String(traveler.Active || 'Yes').toLowerCase() === 'no') return;
    const id = String(traveler['Traveler ID'] || '');
    if (id) map[id] = traveler;
  });
  return map;
}

function smartReminderPaymentCandidates_(context) {
  const selectedCabinId = String(context.trip['Selected Cabin ID'] || '').trim();
  const payments = readSheet_('Payments');
  const paidBySchedule = {};

  payments.forEach(function(payment) {
    const scheduleId = String(payment['Schedule ID'] || '').trim();
    if (!scheduleId) return;
    paidBySchedule[scheduleId] = Number(paidBySchedule[scheduleId] || 0) + Number(payment.Amount || 0);
  });

  return readSheet_('Payment Schedule').map(function(row) {
    const scheduleId = String(row['Schedule ID'] || '').trim();
    const travelerId = String(row['Expected Payer Traveler ID'] || '').trim();
    const cabinId = String(row['Cabin ID'] || '').trim();
    if (!scheduleId || !travelerId || !context.travelers[travelerId]) return null;
    if (selectedCabinId && cabinId !== selectedCabinId) return null;

    const amountDue = Number(row['Amount Due'] || 0);
    const remaining = Math.max(0, amountDue - Number(paidBySchedule[scheduleId] || 0));
    if (remaining <= 0.005) return null;

    const dueDate = smartReminderIsoDate_(row['Due Date']);
    if (!dueDate) return null;
    const daysUntil = smartReminderDaysUntil_(context.clock.date, dueDate);
    if (!isFinite(daysUntil)) return null;

    let stage = '';
    if (daysUntil === 7 && context.clock.hour >= 9) stage = '7-days';
    else if (daysUntil === 1 && context.clock.hour >= 9) stage = '1-day';
    else if (daysUntil === 0 && context.clock.hour >= 8) stage = 'due-today';
    else if (daysUntil < 0 && context.clock.hour >= 9) stage = 'overdue';
    if (!stage) return null;

    const recipientType = String(row['Recipient Type'] || 'Agency');
    const recipientTravelerId = String(row['Recipient Traveler ID'] || '');
    const recipient = recipientType === 'Traveler'
      ? String(context.travelers[recipientTravelerId] && context.travelers[recipientTravelerId].Name || 'booking traveler')
      : String(row['Recipient Name'] || 'booking agency');
    const money = '$' + remaining.toFixed(2);
    const timing = daysUntil === 7
      ? 'due in 7 days'
      : daysUntil === 1
        ? 'due tomorrow'
        : daysUntil === 0
          ? 'due today'
          : 'overdue';

    return {
      travelerId: travelerId,
      type: 'payment',
      id: scheduleId,
      stage: stage,
      date: dueDate,
      heading: daysUntil < 0 ? 'Lodging payment overdue' : 'Lodging payment reminder',
      line: String(row.Label || 'Lodging installment') + ': ' + money + ' ' + timing + ' to ' + recipient + '.',
      priority: daysUntil < 0 ? 0 : (daysUntil === 0 ? 5 : daysUntil)
    };
  }).filter(Boolean);
}

function smartReminderMealCandidates_(context) {
  const daysTarget = 1;
  if (context.clock.hour < 18) return [];

  const candidates = [];
  readSheet_('Meals').forEach(function(row) {
    const date = smartReminderIsoDate_(row.Date);
    if (!date || smartReminderDaysUntil_(context.clock.date, date) !== daysTarget) return;

    Object.keys(context.travelers).forEach(function(travelerId) {
      const traveler = context.travelers[travelerId];
      const name = String(traveler.Name || '');
      const cooking = smartReminderNameMatches_(row['Assigned To'], name);
      const cleanup = smartReminderNameMatches_(row['Clean Up'], name);
      if (!cooking && !cleanup) return;

      const roles = [];
      if (cooking) roles.push('cooking');
      if (cleanup) roles.push('clean up');
      const mealId = String(row['Meal ID'] || (date + ':' + String(row.Meal || 'meal')));

      candidates.push({
        travelerId: travelerId,
        type: 'meal',
        id: mealId,
        stage: 'day-before',
        date: date,
        heading: 'Meal crew reminder',
        line: String(row.Meal || 'Meal') + ' is tomorrow — you’re on ' + roles.join(' and ') + ' crew' + (row.Menu ? ' for ' + String(row.Menu) : '') + '.',
        priority: 20
      });
    });
  });
  return candidates;
}

function smartReminderActivityCandidates_(context) {
  const itineraryMap = {};
  readSheet_('Itinerary').forEach(function(row) {
    itineraryMap[String(row['Itinerary ID'] || '')] = row;
  });

  const nowMinutes = context.clock.hour * 60 + context.clock.minute;
  return readSheet_('Itinerary Signups').map(function(signup) {
    const travelerId = String(signup['Traveler ID'] || '').trim();
    if (!travelerId || !context.travelers[travelerId]) return null;

    const date = smartReminderIsoDate_(signup['Planned Date']);
    if (date !== context.clock.date) return null;

    const timeMatch = String(signup['Planned Time'] || '').match(/^(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;
    const plannedMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    const minutesUntil = plannedMinutes - nowMinutes;
    if (!(minutesUntil > 0 && minutesUntil <= 180)) return null;

    const itineraryId = String(signup['Itinerary ID'] || '');
    const row = itineraryMap[itineraryId] || {};
    const signupId = String(signup['Signup ID'] || (itineraryId + ':' + travelerId));
    const timeLabel = smartReminderTimeLabel_(signup['Planned Time']);
    const location = String(row.Location || '').trim();

    return {
      travelerId: travelerId,
      type: 'activity',
      id: signupId,
      stage: 'coming-up',
      date: date,
      heading: 'Activity coming up',
      line: String(row.Activity || 'Your activity') + ' is at ' + timeLabel + (location ? ' at ' + location : '') + '.',
      priority: 10 + Math.floor(minutesUntil / 60)
    };
  }).filter(Boolean);
}

function smartReminderReadLedger_() {
  const props = PropertiesService.getScriptProperties();
  try {
    return JSON.parse(props.getProperty(SMART_REMINDER_LEDGER_PROPERTY_) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function smartReminderLedgerKey_(item) {
  return [item.type, item.id, item.travelerId, item.stage, item.date].join('|');
}

function smartReminderPruneLedger_(ledger, nowMs) {
  const cutoff = nowMs - 120 * 86400000;
  Object.keys(ledger).forEach(function(key) {
    if (Number(ledger[key] || 0) < cutoff) delete ledger[key];
  });

  const keys = Object.keys(ledger);
  if (keys.length > 1000) {
    keys.sort(function(a, b) { return Number(ledger[a] || 0) - Number(ledger[b] || 0); });
    keys.slice(0, keys.length - 1000).forEach(function(key) { delete ledger[key]; });
  }
  return ledger;
}

function smartReminderReadRunStatus_() {
  try {
    return JSON.parse(
      PropertiesService.getScriptProperties().getProperty(SMART_REMINDER_RUN_STATUS_PROPERTY_) || 'null'
    );
  } catch (error) {
    return null;
  }
}

function smartReminderWriteRunStatus_(status) {
  try {
    const safe = Object.assign({}, status || {}, {
      ranAt: new Date().toISOString()
    });
    if (Array.isArray(safe.failures)) {
      safe.failures = safe.failures.slice(0, 20).map(function(failure) {
        return {
          travelerId: String(failure && failure.travelerId || ''),
          reason: String(failure && failure.reason || 'Delivery failed.').slice(0, 180)
        };
      });
    }
    PropertiesService.getScriptProperties().setProperty(
      SMART_REMINDER_RUN_STATUS_PROPERTY_,
      JSON.stringify(safe)
    );
    return true;
  } catch (error) {
    console.warn('Traveler reminder run status could not be recorded.', error);
    return false;
  }
}

function smartReminderBuildPushPayload_(context, travelerId, items) {
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

  const title = ordered.length === 1
    ? String(ordered[0].heading || 'Vacation reminder')
    : 'You have ' + ordered.length + ' vacation reminders';
  const payload = {
    app_id: String(context.trip['OneSignal App ID'] || '').trim(),
    target_channel: 'push',
    include_aliases: {external_id: [travelerId]},
    headings: {en: title},
    contents: {en: message}
  };

  const pwaUrl = String(context.trip['PWA URL'] || '').trim();
  if (/^https:\/\//i.test(pwaUrl)) payload.url = pwaUrl;

  return {
    payload: payload,
    title: title,
    message: message,
    count: ordered.length
  };
}

function smartReminderSendPush_(context, travelerId, items) {
  const appId = String(context.trip['OneSignal App ID'] || '').trim();
  const apiKey = String(PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_API_KEY') || '').trim();
  if (!appId || !apiKey) return {ok: false, reason: 'push-not-configured'};

  const built = smartReminderBuildPushPayload_(context, travelerId, items);
  const response = UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Key ' + apiKey},
    payload: JSON.stringify(built.payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('OneSignal returned HTTP ' + code + ' for traveler reminder push.');
  }
  return {ok: true, count: built.count};
}

function smartReminderRunResult_(values) {
  const result = Object.assign({
    enabled: false,
    configured: false,
    sent: 0,
    reminders: 0,
    considered: 0,
    attemptedPushes: 0,
    failedPushes: 0,
    failures: []
  }, values || {});
  smartReminderWriteRunStatus_(result);
  return result;
}

function processTravelerReminderPushes_() {
  setupVacationPortalSilent_();

  if (!smartReminderPushEnabled_()) {
    return smartReminderRunResult_({
      enabled: false,
      configured: false,
      outcome: 'disabled'
    });
  }

  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const apiKey = String(PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_API_KEY') || '').trim();
  if (!appId || !apiKey) {
    return smartReminderRunResult_({
      enabled: true,
      configured: false,
      outcome: 'not-configured'
    });
  }

  const context = {
    trip: trip,
    clock: smartReminderNow_(),
    travelers: smartReminderTravelerMap_()
  };

  const ledger = smartReminderPruneLedger_(smartReminderReadLedger_(), Date.now());
  const due = [].concat(
    smartReminderPaymentCandidates_(context),
    smartReminderMealCandidates_(context),
    smartReminderActivityCandidates_(context)
  ).filter(function(item) {
    return !ledger[smartReminderLedgerKey_(item)];
  });

  const byTraveler = {};
  due.forEach(function(item) {
    if (!byTraveler[item.travelerId]) byTraveler[item.travelerId] = [];
    byTraveler[item.travelerId].push(item);
  });

  let sent = 0;
  let deliveredReminders = 0;
  const failures = [];
  const travelerIds = Object.keys(byTraveler);

  travelerIds.forEach(function(travelerId) {
    const items = byTraveler[travelerId];
    try {
      const result = smartReminderSendPush_(context, travelerId, items);
      if (!result.ok) {
        failures.push({travelerId: travelerId, reason: String(result.reason || 'Delivery failed.')});
        return;
      }
      sent++;
      deliveredReminders += items.length;
      const deliveredAt = Date.now();
      items.forEach(function(item) {
        ledger[smartReminderLedgerKey_(item)] = deliveredAt;
      });
    } catch (error) {
      failures.push({
        travelerId: travelerId,
        reason: String(error && error.message ? error.message : error || 'Delivery failed.')
      });
      console.warn('Traveler reminder push failed for ' + travelerId + '.', error);
    }
  });

  smartReminderPruneLedger_(ledger, Date.now());
  PropertiesService.getScriptProperties().setProperty(
    SMART_REMINDER_LEDGER_PROPERTY_,
    JSON.stringify(ledger)
  );

  const outcome = failures.length
    ? (sent ? 'partial-failure' : 'failed')
    : (sent ? 'delivered' : 'nothing-due');

  return smartReminderRunResult_({
    enabled: true,
    configured: true,
    outcome: outcome,
    sent: sent,
    reminders: deliveredReminders,
    considered: due.length,
    attemptedPushes: travelerIds.length,
    failedPushes: failures.length,
    failures: failures
  });
}
