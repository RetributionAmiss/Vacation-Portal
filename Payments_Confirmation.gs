const PAYMENT_CONFIRMATION_HEADERS_ = [
  'Payment ID', 'Cabin ID', 'Schedule ID', 'Paid By Traveler ID',
  'Paid To Type', 'Paid To Traveler ID', 'Paid To Name', 'Amount',
  'Payment Date', 'Notes', 'Created At', 'Updated At',
  'Confirmation Status', 'Confirmation Source',
  'Confirmed By Traveler ID', 'Confirmed At'
];

function ensurePaymentConfirmationColumns_() {
  ensureSheet_(
    getSpreadsheet_(),
    'Payments',
    PAYMENT_CONFIRMATION_HEADERS_
  );
}

function paymentConfirmationActor_(values, record) {
  values = values || {};

  if (String(values.organizerToken || '').trim()) {
    assertOrganizerFromValues_(values);
    return {
      mode: 'Organizer',
      travelerId: ''
    };
  }

  if (String(record['Paid To Type'] || '') !== 'Traveler') {
    throw new Error(
      'TRAVELER_AUTH_REQUIRED: Only traveler reimbursements use recipient confirmation.'
    );
  }

  const recipientId = String(record['Paid To Traveler ID'] || '').trim();
  if (!recipientId) {
    throw new Error('This reimbursement does not have a traveler recipient.');
  }

  assertTravelerSelf_(values.deviceId, recipientId);

  return {
    mode: 'Recipient',
    travelerId: recipientId
  };
}

function setBookingPaymentConfirmation(values) {
  ensurePortalSchemaCurrent_();
  ensurePaymentConfirmationColumns_();

  values = values || {};
  const paymentId = String(values.id || '').trim();
  if (!paymentId) throw new Error('Payment is required.');

  const record = bookingPaymentRecord_(paymentId);
  if (!record) throw new Error('That payment record could not be found.');

  if (String(record['Paid To Type'] || '') !== 'Traveler') {
    throw new Error('Agency payments do not use traveler receipt confirmation.');
  }

  const actor = paymentConfirmationActor_(values, record);
  const confirmed =
    values.confirmed === true ||
    String(values.confirmed || '').toLowerCase() === 'true' ||
    String(values.confirmed || '') === '1';

  updateById_('Payments', 'Payment ID', paymentId, {
    'Confirmation Status': confirmed ? 'Confirmed' : 'Pending',
    'Confirmation Source': confirmed ? actor.mode : '',
    'Confirmed By Traveler ID': confirmed ? actor.travelerId : '',
    'Confirmed At': confirmed ? new Date() : '',
    'Updated At': new Date()
  });

  const data = buildPaymentData_();

  if (typeof writePaymentDataServerCache_ === 'function') {
    writePaymentDataServerCache_(data);
  }

  return data;
}
