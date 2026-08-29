const PAYMENT_SHARES_HEADERS_ = [
  'Share ID', 'Cabin ID', 'Traveler ID', 'Split Basis', 'Source Total',
  'Calculated Share', 'Adjusted Share', 'Notes', 'Created At', 'Updated At'
];

const BOOKING_PLAN_HEADERS_V2_ = [
  'Booking Plan ID', 'Cabin ID', 'Booking Traveler IDs', 'Agency Name',
  'Booking Total', 'Split Basis', 'Notes', 'Created At', 'Updated At'
];

function ensurePaymentSheets_() {
  setupVacationPortalSilent_();
  const ss = getSpreadsheet_();
  ensureSheet_(ss, 'Booking Plans', BOOKING_PLAN_HEADERS_V2_);
  ensureSheet_(ss, 'Payment Shares', PAYMENT_SHARES_HEADERS_);
}

function getPaymentData() {
  ensurePaymentSheets_();
  return buildPaymentData_();
}

function buildPaymentData_() {
  return {
    plans: readSheet_('Booking Plans'),
    shares: readSheet_('Payment Shares'),
    schedule: readSheet_('Payment Schedule'),
    payments: readSheet_('Payments'),
    serverTime: new Date().toISOString()
  };
}

function paymentCabin_(cabinId) {
  cabinId = String(cabinId || '').trim();
  if (!cabinId) throw new Error('Choose a rental first.');

  const cabin = readSheet_('Cabins').find(function(row) {
    return row['Cabin ID'] === cabinId &&
      String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  if (!cabin) throw new Error('That rental could not be found.');
  return cabin;
}

function paymentTravelerMap_() {
  const map = {};
  normalizeTravelerRows_(readSheet_('Travelers')).forEach(function(row) {
    if (String(row.Active || 'Yes').toLowerCase() === 'no') return;
    map[String(row['Traveler ID'] || '')] = row;
  });
  return map;
}

function normalizePaymentTravelerIds_(values, travelerMap) {
  const seen = {};
  const ids = [];
  (Array.isArray(values) ? values : String(values || '').split(','))
    .forEach(function(value) {
      const id = String(value || '').trim();
      if (!id || seen[id] || !travelerMap[id]) return;
      seen[id] = true;
      ids.push(id);
    });
  return ids;
}

function bookingPlanForCabin_(cabinId) {
  return readSheet_('Booking Plans').find(function(row) {
    return row['Cabin ID'] === cabinId;
  }) || null;
}

function bookingTravelerIds_(cabinId) {
  const plan = bookingPlanForCabin_(cabinId);
  return plan
    ? String(plan['Booking Traveler IDs'] || '')
        .split(',')
        .map(function(value) { return value.trim(); })
        .filter(Boolean)
    : [];
}

function normalizePaymentSplitBasis_(value) {
  return String(value || '').toLowerCase() === 'bedroom' ? 'Bedroom' : 'Adult';
}

function paymentShareRowsForCabin_(cabinId) {
  return readSheet_('Payment Shares').filter(function(row) {
    return row['Cabin ID'] === cabinId;
  });
}

function replacePaymentShareRows_(cabinId, rows) {
  const sheet = getSpreadsheet_().getSheetByName('Payment Shares');
  const grid = sheet.getDataRange().getValues();
  const headers = grid[0].map(function(value) { return String(value || '').trim(); });
  const cabinIndex = headers.indexOf('Cabin ID');

  const retained = grid.slice(1).filter(function(row) {
    return String(row[cabinIndex] || '') !== cabinId;
  });

  const inserted = rows.map(function(record) {
    return headers.map(function(header) {
      return record[header] !== undefined ? record[header] : '';
    });
  });

  const output = [headers].concat(retained, inserted);
  sheet.clearContents();
  sheet.getRange(1, 1, output.length, headers.length).setValues(output);
}

function normalizePaymentShareRows_(cabinId, values) {
  const travelerMap = paymentTravelerMap_();
  const now = new Date();
  const basis = normalizePaymentSplitBasis_(values.splitBasis);
  const sourceTotal = Math.max(0, Number(values.sourceTotal || 0));
  const seen = {};

  return (Array.isArray(values.shares) ? values.shares : []).map(function(item) {
    item = item || {};
    const travelerId = String(item.travelerId || '').trim();
    const traveler = travelerMap[travelerId];

    if (!traveler || String(traveler['Traveler Type'] || 'Adult') !== 'Adult') {
      throw new Error('Traveler shares can only be assigned to active adult travelers.');
    }
    if (seen[travelerId]) {
      throw new Error('Each traveler can only have one expected booking share.');
    }
    seen[travelerId] = true;

    const calculated = Math.max(0, Number(item.calculatedShare || 0));
    const adjusted = Math.max(0, Number(item.adjustedShare || 0));

    if (!isFinite(calculated) || !isFinite(adjusted)) {
      throw new Error('Traveler share amounts must be valid numbers.');
    }

    return {
      'Share ID': uid_('SHARE'),
      'Cabin ID': cabinId,
      'Traveler ID': travelerId,
      'Split Basis': basis,
      'Source Total': sourceTotal,
      'Calculated Share': calculated,
      'Adjusted Share': adjusted,
      'Notes': String(item.notes || '').trim(),
      'Created At': now,
      'Updated At': now
    };
  });
}

function savePaymentShares(values) {
  ensurePaymentSheets_();
  values = values || {};
  assertOrganizerFromValues_(values);

  const cabin = paymentCabin_(values.cabinId);
  const rows = normalizePaymentShareRows_(cabin['Cabin ID'], values);
  if (!rows.length) {
    throw new Error('Add at least one adult traveler share before saving.');
  }

  replacePaymentShareRows_(cabin['Cabin ID'], rows);

  const plan = bookingPlanForCabin_(cabin['Cabin ID']);
  if (plan) {
    updateById_('Booking Plans', 'Booking Plan ID', plan['Booking Plan ID'], {
      'Split Basis': normalizePaymentSplitBasis_(values.splitBasis),
      'Updated At': new Date()
    });
  }

  return buildPaymentData_();
}

function saveBookingPlan(values) {
  ensurePaymentSheets_();
  values = values || {};
  assertOrganizerFromValues_(values);

  const cabin = paymentCabin_(values.cabinId);
  const travelerMap = paymentTravelerMap_();
  const bookingTravelerIds = normalizePaymentTravelerIds_(
    values.bookingTravelerIds,
    travelerMap
  );

  if (!bookingTravelerIds.length) {
    throw new Error('Choose at least one traveler who is handling the booking.');
  }

  const requestedTotal = Number(values.bookingTotal || 0);
  const cabinTotal = Number(cabin['Total Rental Cost'] || 0);
  const bookingTotal = requestedTotal > 0 ? requestedTotal : cabinTotal;

  if (!(bookingTotal > 0)) {
    throw new Error('Enter the total amount that must be paid for this booking.');
  }

  const existing = bookingPlanForCabin_(cabin['Cabin ID']);
  const now = new Date();
  const splitBasis = normalizePaymentSplitBasis_(values.splitBasis);
  const record = {
    'Cabin ID': cabin['Cabin ID'],
    'Booking Traveler IDs': bookingTravelerIds.join(','),
    'Agency Name': String(values.agencyName || cabin.Provider || '').trim(),
    'Booking Total': bookingTotal,
    'Split Basis': splitBasis,
    'Notes': String(values.notes || '').trim(),
    'Updated At': now
  };

  if (existing) {
    updateById_(
      'Booking Plans',
      'Booking Plan ID',
      existing['Booking Plan ID'],
      record
    );
  } else {
    record['Booking Plan ID'] = uid_('BOOK');
    record['Created At'] = now;
    appendObject_('Booking Plans', record);
  }

  if (Array.isArray(values.shares) && values.shares.length) {
    replacePaymentShareRows_(
      cabin['Cabin ID'],
      normalizePaymentShareRows_(cabin['Cabin ID'], {
        splitBasis: splitBasis,
        sourceTotal: bookingTotal,
        shares: values.shares
      })
    );
  }

  return buildPaymentData_();
}

function paymentScheduleRecord_(id) {
  id = String(id || '').trim();
  return readSheet_('Payment Schedule').find(function(row) {
    return row['Schedule ID'] === id;
  }) || null;
}

function normalizePaymentRecipient_(cabinId, values) {
  const travelerMap = paymentTravelerMap_();
  const plan = bookingPlanForCabin_(cabinId);
  const bookingIds = bookingTravelerIds_(cabinId);
  const recipientType =
    String(values.recipientType || 'Agency').trim() === 'Traveler'
      ? 'Traveler'
      : 'Agency';

  if (recipientType === 'Traveler') {
    const recipientTravelerId = String(values.recipientTravelerId || '').trim();
    if (!recipientTravelerId || bookingIds.indexOf(recipientTravelerId) < 0) {
      throw new Error('Choose one of the travelers handling the booking as the recipient.');
    }
    return {
      type: 'Traveler',
      travelerId: recipientTravelerId,
      name: travelerMap[recipientTravelerId]
        ? String(travelerMap[recipientTravelerId].Name || '')
        : recipientTravelerId
    };
  }

  const name = String(
    values.recipientName ||
    (plan ? plan['Agency Name'] : '') ||
    ''
  ).trim();

  if (!name) {
    throw new Error('Enter the agency, property manager, or booking payee name.');
  }

  return { type: 'Agency', travelerId: '', name: name };
}

function savePaymentScheduleItem(values) {
  ensurePaymentSheets_();
  values = values || {};
  assertOrganizerFromValues_(values);

  const cabin = paymentCabin_(values.cabinId);
  const amount = Number(values.amountDue || 0);
  if (!(amount > 0)) throw new Error('Scheduled amount must be greater than zero.');

  const recipient = normalizePaymentRecipient_(cabin['Cabin ID'], values);
  const travelerMap = paymentTravelerMap_();
  const expectedPayerId = String(values.expectedPayerTravelerId || '').trim();

  if (expectedPayerId && !travelerMap[expectedPayerId]) {
    throw new Error('The expected payer could not be found.');
  }

  const id = String(values.id || '').trim();
  const existing = id ? paymentScheduleRecord_(id) : null;
  if (id && (!existing || existing['Cabin ID'] !== cabin['Cabin ID'])) {
    throw new Error('That scheduled payment could not be found.');
  }

  const now = new Date();
  const record = {
    'Cabin ID': cabin['Cabin ID'],
    'Label': String(values.label || 'Booking payment').trim(),
    'Due Date': String(values.dueDate || '').trim(),
    'Amount Due': amount,
    'Expected Payer Traveler ID': expectedPayerId,
    'Recipient Type': recipient.type,
    'Recipient Traveler ID': recipient.travelerId,
    'Recipient Name': recipient.name,
    'Notes': String(values.notes || '').trim(),
    'Updated At': now
  };

  if (existing) {
    updateById_('Payment Schedule', 'Schedule ID', existing['Schedule ID'], record);
  } else {
    record['Schedule ID'] = uid_('DUE');
    record['Created At'] = now;
    appendObject_('Payment Schedule', record);
  }

  return buildPaymentData_();
}

function deletePaymentScheduleItem(values) {
  ensurePaymentSheets_();
  values = values && typeof values === 'object' ? values : {id: values};
  assertOrganizerFromValues_(values);

  const record = paymentScheduleRecord_(values.id);
  if (!record) throw new Error('That scheduled payment could not be found.');

  const linked = readSheet_('Payments').some(function(payment) {
    return payment['Schedule ID'] === record['Schedule ID'];
  });
  if (linked) {
    throw new Error(
      'This installment already has payment history. Edit the installment instead of deleting it.'
    );
  }

  deleteById_('Payment Schedule', 'Schedule ID', record['Schedule ID']);
  return buildPaymentData_();
}

function bookingPaymentRecord_(id) {
  id = String(id || '').trim();
  return readSheet_('Payments').find(function(row) {
    return row['Payment ID'] === id;
  }) || null;
}

function paymentWriteMode_(values, existing, requestedPayerId) {
  values = values || {};
  const organizerToken = String(values.organizerToken || '').trim();

  if (organizerToken) {
    assertOrganizerFromValues_(values);
    return 'Organizer';
  }

  const payerId = existing
    ? String(existing['Paid By Traveler ID'] || '').trim()
    : String(requestedPayerId || '').trim();

  assertTravelerSelf_(values.deviceId, payerId);

  if (
    existing &&
    String(requestedPayerId || '').trim() !== payerId
  ) {
    throw new Error('TRAVELER_AUTH_REQUIRED: You cannot change who made an existing payment.');
  }

  return 'Traveler';
}

function saveBookingPayment(values) {
  ensurePaymentSheets_();
  values = values || {};

  const cabin = paymentCabin_(values.cabinId);
  const travelerMap = paymentTravelerMap_();
  const paidByTravelerId = String(values.paidByTravelerId || '').trim();
  if (!paidByTravelerId || !travelerMap[paidByTravelerId]) {
    throw new Error('Choose the traveler who made this payment.');
  }

  const id = String(values.id || '').trim();
  const existing = id ? bookingPaymentRecord_(id) : null;
  if (id && (!existing || existing['Cabin ID'] !== cabin['Cabin ID'])) {
    throw new Error('That payment record could not be found.');
  }

  const writeMode = paymentWriteMode_(values, existing, paidByTravelerId);

  const amount = Number(values.amount || 0);
  if (!(amount > 0)) throw new Error('Payment amount must be greater than zero.');

  const scheduleId = String(values.scheduleId || '').trim();
  const schedule = scheduleId ? paymentScheduleRecord_(scheduleId) : null;
  if (scheduleId && (!schedule || schedule['Cabin ID'] !== cabin['Cabin ID'])) {
    throw new Error('The selected installment could not be found for this rental.');
  }

  if (
    writeMode === 'Traveler' &&
    schedule &&
    String(schedule['Expected Payer Traveler ID'] || '').trim() &&
    String(schedule['Expected Payer Traveler ID'] || '').trim() !== paidByTravelerId
  ) {
    throw new Error('This installment is assigned to another traveler.');
  }

  const recipient = schedule
    ? {
        type: String(schedule['Recipient Type'] || 'Agency'),
        travelerId: String(schedule['Recipient Traveler ID'] || ''),
        name: String(schedule['Recipient Name'] || '')
      }
    : normalizePaymentRecipient_(cabin['Cabin ID'], values);

  const now = new Date();
  const record = {
    'Cabin ID': cabin['Cabin ID'],
    'Schedule ID': schedule ? schedule['Schedule ID'] : '',
    'Paid By Traveler ID': paidByTravelerId,
    'Paid To Type': recipient.type,
    'Paid To Traveler ID': recipient.travelerId,
    'Paid To Name': recipient.name,
    'Amount': amount,
    'Payment Date': String(values.paymentDate || '').trim(),
    'Notes': String(values.notes || '').trim(),
    'Updated At': now
  };

  if (existing) {
    updateById_('Payments', 'Payment ID', existing['Payment ID'], record);
  } else {
    record['Payment ID'] = uid_('PAY');
    record['Created At'] = now;
    appendObject_('Payments', record);
  }

  return buildPaymentData_();
}

function deleteBookingPayment(values) {
  ensurePaymentSheets_();
  values = values && typeof values === 'object' ? values : {id: values};

  const record = bookingPaymentRecord_(values.id);
  if (!record) throw new Error('That payment record could not be found.');

  paymentWriteMode_(values, record, record['Paid By Traveler ID']);
  deleteById_('Payments', 'Payment ID', record['Payment ID']);
  return buildPaymentData_();
}
