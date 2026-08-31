function normalizeGeneratedPaymentMilestones_(values) {
  const raw = Array.isArray(values) ? values : [];
  if (!raw.length) throw new Error('Add at least one payment milestone to generate.');
  if (raw.length > 12) throw new Error('Generate no more than 12 payment milestones at a time.');

  return raw.map(function(item, index) {
    item = item || {};
    const amount = Number(item.amountDue || 0);
    const dueDate = String(item.dueDate || '').trim();
    const label = String(item.label || ('Payment ' + (index + 1))).trim();

    if (!(amount > 0) || !isFinite(amount)) {
      throw new Error('Each generated milestone must have an amount greater than zero.');
    }
    if (!dueDate) {
      throw new Error('Each generated milestone needs a due date.');
    }

    return {
      label: label || ('Payment ' + (index + 1)),
      dueDate: dueDate,
      amountDue: Math.round(amount * 100) / 100
    };
  });
}

function allocateGeneratedPaymentCents_(totalCents, shares) {
  const totalShare = shares.reduce(function(sum, row) {
    return sum + Number(row.adjustedShare || 0);
  }, 0);

  if (!(totalShare > 0)) {
    throw new Error('Saved traveler payment shares must total more than zero.');
  }

  let cumulativeShare = 0;
  let allocated = 0;

  return shares.map(function(row, index) {
    cumulativeShare += Number(row.adjustedShare || 0);
    const target = index === shares.length - 1
      ? totalCents
      : Math.round(totalCents * cumulativeShare / totalShare);
    const cents = Math.max(0, target - allocated);
    allocated += cents;
    return cents;
  });
}

function appendGeneratedPaymentScheduleRows_(rows) {
  if (!rows.length) return;

  const sheet = getSpreadsheet_().getSheetByName('Payment Schedule');
  if (!sheet) throw new Error('Payment Schedule sheet is missing.');

  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  const values = rows.map(function(record) {
    return headers.map(function(header) {
      return record[header] !== undefined ? record[header] : '';
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length)
    .setValues(values);
}

function generatePaymentInstallments(values) {
  ensurePaymentSheets_();
  values = values || {};
  assertOrganizerFromValues_(values);

  const cabin = paymentCabin_(values.cabinId);
  const cabinId = cabin['Cabin ID'];
  const plan = bookingPlanForCabin_(cabinId);
  if (!plan) {
    throw new Error('Set up booking responsibility before generating traveler installments.');
  }

  const travelerMap = paymentTravelerMap_();
  const savedShares = paymentShareRowsForCabin_(cabinId)
    .map(function(row) {
      return {
        travelerId: String(row['Traveler ID'] || '').trim(),
        adjustedShare: Math.max(0, Number(row['Adjusted Share'] || 0))
      };
    })
    .filter(function(row) {
      return row.travelerId && row.adjustedShare > 0 && travelerMap[row.travelerId];
    })
    .sort(function(a, b) {
      return String(travelerMap[a.travelerId].Name || '')
        .localeCompare(String(travelerMap[b.travelerId].Name || ''));
    });

  if (!savedShares.length) {
    throw new Error('Save traveler payment shares before generating installments.');
  }

  const milestones = normalizeGeneratedPaymentMilestones_(values.milestones);
  const bookingIds = bookingTravelerIds_(cabinId);
  const recipientType = String(values.recipientType || 'Agency') === 'Traveler'
    ? 'Traveler'
    : 'Agency';
  const recipientTravelerId = String(values.recipientTravelerId || '').trim();
  const agencyName = String(plan['Agency Name'] || cabin.Provider || '').trim();

  if (!agencyName) {
    throw new Error('Set the agency or property payee before generating installments.');
  }

  if (
    recipientType === 'Traveler' &&
    (!recipientTravelerId || bookingIds.indexOf(recipientTravelerId) < 0)
  ) {
    throw new Error('Choose one of the travelers handling the booking as the reimbursement recipient.');
  }

  const now = new Date();
  const rows = [];

  milestones.forEach(function(milestone) {
    const totalCents = Math.round(Number(milestone.amountDue || 0) * 100);
    const centsByTraveler = allocateGeneratedPaymentCents_(totalCents, savedShares);

    savedShares.forEach(function(share, index) {
      const cents = centsByTraveler[index];
      if (!(cents > 0)) return;

      const payerId = share.travelerId;
      const reimburseAnotherTraveler =
        recipientType === 'Traveler' && payerId !== recipientTravelerId;
      const recipientId = reimburseAnotherTraveler ? recipientTravelerId : '';
      const recipientName = reimburseAnotherTraveler
        ? String(travelerMap[recipientTravelerId].Name || recipientTravelerId)
        : agencyName;

      rows.push({
        'Schedule ID': uid_('DUE'),
        'Cabin ID': cabinId,
        'Label': milestone.label,
        'Due Date': milestone.dueDate,
        'Amount Due': cents / 100,
        'Expected Payer Traveler ID': payerId,
        'Recipient Type': reimburseAnotherTraveler ? 'Traveler' : 'Agency',
        'Recipient Traveler ID': recipientId,
        'Recipient Name': recipientName,
        'Notes': 'Generated from saved traveler payment shares.',
        'Created At': now,
        'Updated At': now
      });
    });
  });

  if (!rows.length) {
    throw new Error('No traveler installments could be generated from the saved shares.');
  }

  appendGeneratedPaymentScheduleRows_(rows);
  return buildPaymentData_();
}
