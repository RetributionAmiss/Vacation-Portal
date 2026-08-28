function getPaymentData() {
  setupVacationPortalSilent_();
  return buildPaymentData_();
}

function buildPaymentData_() {
  return {
    plans: readSheet_('Booking Plans'),
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

function saveBookingPlan(values) {
  setupVacationPortalSilent_();
  values = values || {};

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
  const record = {
    'Cabin ID': cabin['Cabin ID'],
    'Booking Traveler IDs': bookingTravelerIds.join(','),
    'Agency Name': String(values.agencyName || cabin.Provider || '').trim(),
    'Booking Total': bookingTotal,
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
  setupVacationPortalSilent_();
  values = values || {};

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

function deletePaymentScheduleItem(id) {
  setupVacationPortalSilent_();
  const record = paymentScheduleRecord_(id);
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

function saveBookingPayment(values) {
  setupVacationPortalSilent_();
  values = values || {};

  const cabin = paymentCabin_(values.cabinId);
  const travelerMap = paymentTravelerMap_();
  const paidByTravelerId = String(values.paidByTravelerId || '').trim();
  if (!paidByTravelerId || !travelerMap[paidByTravelerId]) {
    throw new Error('Choose the traveler who made this payment.');
  }

  const amount = Number(values.amount || 0);
  if (!(amount > 0)) throw new Error('Payment amount must be greater than zero.');

  const scheduleId = String(values.scheduleId || '').trim();
  const schedule = scheduleId ? paymentScheduleRecord_(scheduleId) : null;
  if (scheduleId && (!schedule || schedule['Cabin ID'] !== cabin['Cabin ID'])) {
    throw new Error('The selected installment could not be found for this rental.');
  }

  const recipient = schedule
    ? {
        type: String(schedule['Recipient Type'] || 'Agency'),
        travelerId: String(schedule['Recipient Traveler ID'] || ''),
        name: String(schedule['Recipient Name'] || '')
      }
    : normalizePaymentRecipient_(cabin['Cabin ID'], values);

  const id = String(values.id || '').trim();
  const existing = id ? bookingPaymentRecord_(id) : null;
  if (id && (!existing || existing['Cabin ID'] !== cabin['Cabin ID'])) {
    throw new Error('That payment record could not be found.');
  }

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

function deleteBookingPayment(id) {
  setupVacationPortalSilent_();
  const record = bookingPaymentRecord_(id);
  if (!record) throw new Error('That payment record could not be found.');
  deleteById_('Payments', 'Payment ID', record['Payment ID']);
  return buildPaymentData_();
}
