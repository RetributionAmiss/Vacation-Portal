function getOrganizerVotingSummary(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const trip = getSettings_('Trip');
  const round = String(trip['Voting Round'] || 'Preliminary');
  const method = normalizeVotingMethod_(trip['Voting Method']);
  const stage = String(trip['Portal Stage'] || '');
  const travelers = normalizeTravelerRows_(readSheet_('Travelers'))
    .filter(function(row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    });
  const cabins = readSheet_('Cabins').filter(function(row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });
  const finalistIds = String(trip['Finalist Cabin IDs'] || '')
    .split('|').map(function(value) { return value.trim(); }).filter(Boolean);
  const eligibleCabins = round === 'Final' && finalistIds.length
    ? cabins.filter(function(cabin) {
        return finalistIds.indexOf(String(cabin['Cabin ID'] || '')) >= 0;
      })
    : cabins;

  const eligibleIds = {};
  const cabinById = {};
  eligibleCabins.forEach(function(cabin) {
    const id = String(cabin['Cabin ID'] || '');
    if (!id) return;
    eligibleIds[id] = true;
    cabinById[id] = cabin;
  });

  const votes = readSheet_('Votes').filter(function(vote) {
    return String(vote['Voting Round'] || 'Preliminary') === round &&
      Boolean(eligibleIds[String(vote['Cabin ID'] || '')]);
  });
  const latestVotes = {};
  votes.forEach(function(vote) {
    const travelerId = String(vote['Traveler ID'] || '');
    const cabinId = String(vote['Cabin ID'] || '');
    if (!travelerId || !cabinId) return;
    const key = travelerId + '|' + cabinId;
    const current = latestVotes[key];
    const incomingTime = new Date(vote['Created At'] || 0).getTime() || 0;
    const currentTime = current
      ? (new Date(current['Created At'] || 0).getTime() || 0)
      : -1;
    if (!current || incomingTime >= currentTime) latestVotes[key] = vote;
  });

  const devicesByTraveler = {};
  const allProperties = PropertiesService.getScriptProperties().getProperties();
  Object.keys(allProperties).forEach(function(key) {
    if (key.indexOf('PORTAL_DEVICE_PROFILE_') !== 0) return;
    try {
      const profile = JSON.parse(allProperties[key] || '{}');
      const travelerId = String(profile.travelerId || '');
      if (!travelerId) return;
      if (!devicesByTraveler[travelerId]) {
        devicesByTraveler[travelerId] = {linked: 0, installed: 0};
      }
      devicesByTraveler[travelerId].linked += 1;
      if (Boolean(profile.pwaInstalled)) devicesByTraveler[travelerId].installed += 1;
    } catch (error) {}
  });

  function cabinName_(cabin) {
    return String(
      cabin.Nickname || cabin['Cabin Name'] || cabin['Rental Name'] ||
      cabin.Name || cabin['Property Name'] || cabin['Provider Property ID'] ||
      cabin['Cabin ID'] || 'Rental'
    ).trim();
  }

  const rows = travelers.map(function(traveler) {
    const travelerId = String(traveler['Traveler ID'] || '');
    const travelerVotes = Object.keys(latestVotes)
      .map(function(key) { return latestVotes[key]; })
      .filter(function(vote) {
        return String(vote['Traveler ID'] || '') === travelerId;
      });

    const top3 = travelerVotes.map(function(vote) {
      const cabinId = String(vote['Cabin ID'] || '');
      const cabin = cabinById[cabinId];
      return {
        cabinId: cabinId,
        nickname: cabin ? cabinName_(cabin) : cabinId,
        score: Number(vote.Score || 0),
        rank: Number(vote.Rank || 0)
      };
    }).filter(function(item) {
      if (!item.cabinId) return false;
      return method === 'Ranking'
        ? item.rank >= 1 && item.rank <= eligibleCabins.length
        : item.score >= 1 && item.score <= 5;
    }).sort(function(left, right) {
      if (method === 'Ranking') {
        return left.rank - right.rank ||
          left.nickname.localeCompare(right.nickname);
      }

      return right.score - left.score ||
        left.nickname.localeCompare(right.nickname);
    }).slice(0, 3);

    const validVoteCount = travelerVotes.filter(function(vote) {
      if (method === 'Ranking') {
        const rank = Number(vote.Rank || 0);
        return rank >= 1 && rank <= eligibleCabins.length;
      }

      const score = Number(vote.Score || 0);
      return score >= 1 && score <= 5;
    }).length;

    const deviceInfo = devicesByTraveler[travelerId] || {linked: 0, installed: 0};
    return {
      travelerId: travelerId,
      travelerName: String(traveler.Name || 'Traveler'),
      family: String(traveler.Group || traveler.Family || ''),
      votedCount: validVoteCount,
      eligibleRentalCount: eligibleCabins.length,
      top3: top3,
      appInstalled: deviceInfo.installed > 0,
      installedDeviceCount: deviceInfo.installed,
      linkedDeviceCount: deviceInfo.linked
    };
  }).sort(function(left, right) {
    return left.travelerName.localeCompare(right.travelerName);
  });

  return {
    round: round,
    method: method,
    stage: stage,
    eligibleRentalCount: eligibleCabins.length,
    rows: rows,
    generatedAt: new Date().toISOString()
  };
}
