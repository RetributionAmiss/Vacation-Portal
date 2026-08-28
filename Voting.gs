function eligibleVotingCabinIds_(round) {
  const activeIds = readSheet_('Cabins')
    .filter(function (row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    })
    .map(function (row) {
      return String(row['Cabin ID'] || '').trim();
    })
    .filter(Boolean);

  if (String(round || '') !== 'Final') return activeIds;

  const finalistIds = getFinalistCabinIds_();
  return activeIds.filter(function (id) {
    return finalistIds.indexOf(id) >= 0;
  });
}

function serializeVoteForClient_(vote) {
  const result = Object.assign({}, vote || {});
  const createdAt = result['Created At'];

  if (createdAt instanceof Date) {
    result['Created At'] = createdAt.toISOString();
  } else if (createdAt) {
    result['Created At'] = String(createdAt);
  }

  return result;
}

function saveVoteFast(values) {
  setupVacationPortalSilent_();

  values = values || {};

  const cabinId = String(values.cabinId || '').trim();
  const travelerId = String(values.travelerId || '').trim();
  const round = String(values.round || 'Preliminary').trim();
  const method = getVotingMethod_();
  const score = Number(values.score || 0);
  const rank = Number(values.rank || 0);

  if (!cabinId || !travelerId) {
    throw new Error('Cabin and traveler are required.');
  }

  const eligibleIds = eligibleVotingCabinIds_(round);
  if (eligibleIds.indexOf(cabinId) < 0) {
    throw new Error('That rental is not part of the current voting round.');
  }

  if (method === 'Ranking') {
    if (
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > eligibleIds.length
    ) {
      throw new Error(
        'Choose a rank from 1 to ' + eligibleIds.length + '.'
      );
    }
  } else if (score < 1 || score > 5) {
    throw new Error('Choose a rating from 1 to 5.');
  }

  if (round === 'Final') {
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
  const scoreIndex = headers.indexOf('Score');
  const rankIndex = headers.indexOf('Rank');
  const firstChoiceIndex = headers.indexOf('First Choice');
  const roundIndex = headers.indexOf('Voting Round');

  if (
    voteIdIndex < 0 || cabinIndex < 0 || travelerIndex < 0 ||
    scoreIndex < 0 || rankIndex < 0 || roundIndex < 0
  ) {
    throw new Error('Votes sheet columns are incomplete. Refresh the portal and try again.');
  }

  let rowNumber = 0;
  let voteId = '';
  let previousRank = 0;

  for (let row = 1; row < valuesGrid.length; row++) {
    if (
      String(valuesGrid[row][cabinIndex] || '') === cabinId &&
      String(valuesGrid[row][travelerIndex] || '') === travelerId &&
      String(valuesGrid[row][roundIndex] || '') === round
    ) {
      rowNumber = row + 1;
      voteId = String(valuesGrid[row][voteIdIndex] || '');
      previousRank = Number(valuesGrid[row][rankIndex] || 0);
      break;
    }
  }

  if (!voteId) voteId = uid_('VOTE');

  if (method === 'Ranking') {
    for (let row = 1; row < valuesGrid.length; row++) {
      const sameTraveler =
        String(valuesGrid[row][travelerIndex] || '') === travelerId;
      const sameRound =
        String(valuesGrid[row][roundIndex] || '') === round;
      const otherCabin =
        String(valuesGrid[row][cabinIndex] || '') !== cabinId;
      const sameRank = Number(valuesGrid[row][rankIndex] || 0) === rank;

      if (!sameTraveler || !sameRound || !otherCabin || !sameRank) continue;

      const replacementRank =
        Number.isInteger(previousRank) &&
        previousRank >= 1 &&
        previousRank <= eligibleIds.length &&
        previousRank !== rank
          ? previousRank
          : '';

      sheet.getRange(row + 1, rankIndex + 1).setValue(replacementRank);

      if (firstChoiceIndex >= 0) {
        sheet.getRange(row + 1, firstChoiceIndex + 1)
          .setValue(replacementRank === 1 ? 'Yes' : '');
      }

      break;
    }
  }

  if (firstChoiceIndex >= 0) {
    for (let row = 1; row < valuesGrid.length; row++) {
      if (
        String(valuesGrid[row][travelerIndex] || '') === travelerId &&
        String(valuesGrid[row][roundIndex] || '') === round &&
        String(valuesGrid[row][cabinIndex] || '') !== cabinId
      ) {
        if (method === 'Rating' || rank === 1) {
          sheet.getRange(row + 1, firstChoiceIndex + 1).setValue('');
        }
      }
    }
  }

  const record = {
    'Vote ID': voteId,
    'Cabin ID': cabinId,
    'Traveler ID': travelerId,
    'Score': method === 'Rating' ? score : '',
    'Rank': method === 'Ranking' ? rank : '',
    'Notes': String(values.notes || '').trim(),
    'Reasons': '',
    'First Choice': method === 'Ranking' && rank === 1 ? 'Yes' : '',
    'Voting Round': round,
    'Created At': new Date()
  };

  const outputRow = headers.map(function (header) {
    return record[header] !== undefined ? record[header] : '';
  });

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, outputRow.length).setValues([outputRow]);
  } else {
    sheet.appendRow(outputRow);
  }

  const allRoundVotes = readSheet_('Votes').filter(function (vote) {
    return String(vote['Voting Round'] || 'Preliminary') === round;
  });

  const cabinVotes = allRoundVotes.filter(function (vote) {
    return String(vote['Cabin ID'] || '') === cabinId;
  });

  const validScores = cabinVotes
    .map(function (vote) { return Number(vote.Score || 0); })
    .filter(function (value) { return value >= 1 && value <= 5; });

  const validRanks = cabinVotes
    .map(function (vote) { return Number(vote.Rank || 0); })
    .filter(function (value) {
      return Number.isInteger(value) && value >= 1 && value <= eligibleIds.length;
    });

  const firstPlaceCount = cabinVotes.filter(function (vote) {
    return Number(vote.Rank || 0) === 1;
  }).length;

  const travelerVotes = allRoundVotes
    .filter(function (vote) {
      return String(vote['Traveler ID'] || '') === travelerId &&
        eligibleIds.indexOf(String(vote['Cabin ID'] || '')) >= 0;
    })
    .map(serializeVoteForClient_);

  return {
    ok: true,
    method: method,
    vote: serializeVoteForClient_(record),
    travelerVotes: travelerVotes,
    cabinId: cabinId,
    voteCount: method === 'Ranking' ? validRanks.length : validScores.length,
    averageScore: validScores.length
      ? validScores.reduce(function (total, value) {
          return total + value;
        }, 0) / validScores.length
      : 0,
    averageRank: validRanks.length
      ? validRanks.reduce(function (total, value) {
          return total + value;
        }, 0) / validRanks.length
      : 0,
    firstPlaceCount: firstPlaceCount,
    message: rowNumber
      ? 'Your ' + method.toLowerCase() + ' was updated.'
      : 'Your ' + method.toLowerCase() + ' was saved.'
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
    'Rank': '',
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
