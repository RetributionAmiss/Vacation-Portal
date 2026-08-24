function saveVoteFast(values) {
  setupVacationPortalSilent_();

  values = values || {};

  const cabinId = String(values.cabinId || '').trim();
  const travelerId = String(values.travelerId || '').trim();
  const round = String(values.round || 'Preliminary').trim();
  const score = Number(values.score || 0);
  const firstChoice = Boolean(values.firstChoice);

  if (!cabinId || !travelerId) {
    throw new Error('Cabin and traveler are required.');
  }

  if (score < 1 || score > 5) {
    throw new Error('Choose a rating from 1 to 5.');
  }

  if (round === 'Final') {
    const finalists = getFinalistCabinIds_();

    if (finalists.indexOf(cabinId) < 0) {
      throw new Error('That rental is not part of the final voting round.');
    }

    if (
      String(getSettings_('Trip')['Final Voting Closed'] || 'No')
        .toLowerCase() === 'yes'
    ) {
      throw new Error('Final voting is closed.');
    }
  }

  const sheet = getSpreadsheet_().getSheetByName('Votes');
  const valuesGrid = sheet.getDataRange().getValues();
  const headers = valuesGrid[0].map(function (value) {
    return String(value || '').trim();
  });

  const voteIdIndex = headers.indexOf('Vote ID');
  const cabinIndex = headers.indexOf('Cabin ID');
  const travelerIndex = headers.indexOf('Traveler ID');
  const roundIndex = headers.indexOf('Voting Round');

  let rowNumber = 0;
  let voteId = '';

  for (let row = 1; row < valuesGrid.length; row++) {
    if (
      String(valuesGrid[row][cabinIndex] || '') === cabinId &&
      String(valuesGrid[row][travelerIndex] || '') === travelerId &&
      String(valuesGrid[row][roundIndex] || '') === round
    ) {
      rowNumber = row + 1;
      voteId = String(valuesGrid[row][voteIdIndex] || '');
      break;
    }
  }

  if (!voteId) voteId = uid_('VOTE');

  const reasons = Array.isArray(values.reasons)
    ? values.reasons
    : String(values.reasons || '').split('|');

  const record = {
    'Vote ID': voteId,
    'Cabin ID': cabinId,
    'Traveler ID': travelerId,
    'Score': score,
    'Notes': String(values.notes || '').trim(),
    'Reasons': reasons
      .map(function (reason) { return String(reason || '').trim(); })
      .filter(Boolean)
      .slice(0, 3)
      .join('|'),
    'First Choice': firstChoice ? 'Yes' : '',
    'Voting Round': round,
    'Created At': new Date()
  };

  const outputRow = headers.map(function (header) {
    return record[header] !== undefined ? record[header] : '';
  });

  if (round === 'Final' && firstChoice) {
    const firstChoiceIndex = headers.indexOf('First Choice');

    if (firstChoiceIndex >= 0) {
      for (let row = 1; row < valuesGrid.length; row++) {
        if (
          String(valuesGrid[row][travelerIndex] || '') === travelerId &&
          String(valuesGrid[row][roundIndex] || '') === 'Final' &&
          String(valuesGrid[row][cabinIndex] || '') !== cabinId &&
          String(valuesGrid[row][firstChoiceIndex] || '').toLowerCase() === 'yes'
        ) {
          sheet.getRange(row + 1, firstChoiceIndex + 1).setValue('');
        }
      }
    }
  }

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, outputRow.length).setValues([outputRow]);
  } else {
    sheet.appendRow(outputRow);
  }

  const roundVotes = readSheet_('Votes').filter(function (vote) {
    return vote['Cabin ID'] === cabinId &&
      String(vote['Voting Round'] || '') === round;
  });

  const scores = roundVotes
    .map(function (vote) { return Number(vote.Score || 0); })
    .filter(function (value) { return value >= 1 && value <= 5; });

  return {
    ok: true,
    vote: Object.assign({}, record, {
      'Created At': record['Created At'].toISOString()
    }),
    cabinId: cabinId,
    voteCount: scores.length,
    averageScore: scores.length
      ? scores.reduce(function (total, value) {
          return total + value;
        }, 0) / scores.length
      : 0,
    message: rowNumber
      ? 'Your rating was updated.'
      : 'Your rating was saved.'
  };
}

function saveVote(values) {
  const existing = readSheet_('Votes').find(v =>
    v['Cabin ID'] === values.cabinId &&
    v['Traveler ID'] === values.travelerId &&
    String(v['Voting Round']) === String(values.round)
  );
  const record = {
    'Cabin ID': values.cabinId,
    'Traveler ID': values.travelerId,
    'Score': Number(values.score || 0),
    'Notes': String(values.notes || ''),
    'Voting Round': values.round || 'Preliminary',
    'Created At': new Date()
  };
  if (existing) updateById_('Votes', 'Vote ID', existing['Vote ID'], record);
  else {
    record['Vote ID'] = uid_('VOTE');
    appendObject_('Votes', record);
  }
  return getPortalData();
}

function toggleFavorite(cabinId, travelerId) {
  const existing = readSheet_('Favorites').find(f => f['Cabin ID'] === cabinId && f['Traveler ID'] === travelerId);
  if (existing) deleteById_('Favorites', 'Favorite ID', existing['Favorite ID']);
  else appendObject_('Favorites', {
    'Favorite ID': uid_('FAV'),
    'Cabin ID': cabinId,
    'Traveler ID': travelerId,
    'Created At': new Date()
  });
  return getPortalData();
}

function saveComment(values) {
  values = values || {};

  const text = String(values.comment || '').trim();

  if (!text) {
    throw new Error('Enter a comment.');
  }

  const travelerId = String(values.travelerId || '').trim();
  const cabinId = String(values.cabinId || '').trim();

  const traveler = readSheet_('Travelers').find(function (row) {
    return row['Traveler ID'] === travelerId;
  });

  const record = {
    'Comment ID': uid_('COMMENT'),
    'Cabin ID': cabinId,
    'Traveler ID': travelerId,
    'Comment': text,
    'Created At': new Date()
  };

  appendObject_('Comments', record);

  return {
    'Comment ID': record['Comment ID'],
    'Cabin ID': cabinId,
    'Traveler ID': travelerId,
    'Comment': text,
    'Created At': record['Created At'].toISOString(),
    travelerName: traveler ? String(traveler.Name || '').trim() : 'Traveler'
  };
}
