function getOrganizerVotingSummary(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const trip = getSettings_('Trip');
  const round = String(trip['Voting Round'] || 'Preliminary');
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
      cabin['Rental Name'] || cabin.Name || cabin['Property Name'] ||
      cabin['Provider Property ID'] || cabin['Cabin ID'] || 'Rental'
    ).trim();
  }

  const rows = travelers.map(function(traveler) {
    const travelerId = String(traveler['Traveler ID'] || '');
    const travelerVotes = Object.keys(latestVotes)
      .map(function(key) { return latestVotes[key]; })
      .filter(function(vote) {
        return String(vote['Traveler ID'] || '') === travelerId;
      });
    const ranked = travelerVotes.map(function(vote) {
      const cabinId = String(vote['Cabin ID'] || '');
      const cabin = cabinById[cabinId];
      return {
        cabinId: cabinId,
        name: cabin ? cabinName_(cabin) : cabinId,
        score: Number(vote.Score || 0),
        firstChoice: String(vote['First Choice'] || '').toLowerCase() === 'yes'
      };
    }).filter(function(item) {
      return item.cabinId && item.score >= 1 && item.score <= 5;
    }).sort(function(left, right) {
      return Number(right.firstChoice) - Number(left.firstChoice) ||
        right.score - left.score || left.name.localeCompare(right.name);
    }).slice(0, 3);

    const deviceInfo = devicesByTraveler[travelerId] || {linked: 0, installed: 0};
    return {
      travelerId: travelerId,
      travelerName: String(traveler.Name || 'Traveler'),
      family: String(traveler.Group || traveler.Family || ''),
      votedCount: travelerVotes.length,
      eligibleRentalCount: eligibleCabins.length,
      top3: ranked,
      appInstalled: deviceInfo.installed > 0,
      installedDeviceCount: deviceInfo.installed,
      linkedDeviceCount: deviceInfo.linked
    };
  }).sort(function(left, right) {
    return left.travelerName.localeCompare(right.travelerName);
  });

  return {
    round: round,
    stage: stage,
    eligibleRentalCount: eligibleCabins.length,
    rows: rows,
    generatedAt: new Date().toISOString()
  };
}
