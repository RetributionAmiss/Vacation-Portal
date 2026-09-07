function portalPricingMoney_(value) {
  const amount = Number(value || 0);
  if (!isFinite(amount)) return 0;

  if (
    typeof portalMoneyToCents_ === 'function' &&
    typeof portalCentsToMoney_ === 'function'
  ) {
    return portalCentsToMoney_(
      portalMoneyToCents_(Math.max(0, amount))
    );
  }

  return Math.round(Math.max(0, amount) * 100) / 100;
}

function portalPricingActiveAdults_(travelers) {
  return (travelers || []).filter(function(traveler) {
    return String(traveler.Active || 'Yes').toLowerCase() !== 'no' &&
      String(traveler['Traveler Type'] || 'Adult') === 'Adult';
  });
}

function portalPricingPriceCap_(traveler) {
  return Math.max(0, Number(traveler && traveler['Price Cap'] || 0));
}

function portalPricingCostPercent_(traveler) {
  if (!traveler) return 100;

  const raw = traveler['Cost %'];
  if (raw === '' || raw === null || raw === undefined) return 100;

  const value = Number(raw);
  if (!isFinite(value)) return 100;
  return Math.max(0, Math.min(100, value));
}

function portalPricingWillPayMore_(traveler) {
  return String(traveler && traveler['Pay More'] || 'No') === 'Yes';
}

function portalPricingIncludedExtras_(budget) {
  return (budget || []).reduce(function(total, item) {
    if (String(item['Include in Rental Split'] || 'No') !== 'Yes') return total;
    const amount = Number(item.Amount || 0);
    return total + (isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

function portalPricingRedistribute_(baseRows, totalCost) {
  const epsilon = 0.005;
  const total = Math.max(0, Number(totalCost || 0));

  const rows = (baseRows || []).map(function(row) {
    const traveler = row.traveler || {};
    const cap = portalPricingPriceCap_(traveler);
    const base = Math.max(0, Number(row.base || 0));
    const capped = cap > 0 && base > cap;
    const costPercent = portalPricingCostPercent_(traveler);

    return {
      travelerId: String(traveler['Traveler ID'] || ''),
      travelerName: String(traveler.Name || 'Traveler'),
      base: base,
      amount: capped ? cap : base,
      capped: capped,
      extra: 0,
      weighted: costPercent !== 100,
      policyAdjusted: capped || costPercent !== 100,
      _cap: cap,
      _payMore: portalPricingWillPayMore_(traveler)
    };
  });

  let remainder = Math.max(
    0,
    total - rows.reduce(function(sum, row) {
      return sum + row.amount;
    }, 0)
  );

  let safety = 0;
  while (remainder > epsilon && safety < 50) {
    safety++;

    const eligible = rows.filter(function(row) {
      if (!row._payMore) return false;
      if (row._cap <= 0) return true;
      return row.amount < row._cap - epsilon;
    });

    if (!eligible.length) break;

    const equalExtra = remainder / eligible.length;
    let distributed = 0;

    eligible.forEach(function(row) {
      const capacity = row._cap > 0
        ? Math.max(0, row._cap - row.amount)
        : equalExtra;
      const add = row._cap > 0
        ? Math.min(equalExtra, capacity)
        : equalExtra;

      row.amount += add;
      row.extra += add;
      row.policyAdjusted = true;
      distributed += add;
    });

    if (distributed <= epsilon) break;
    remainder = Math.max(0, remainder - distributed);
  }

  const publicRows = rows.map(function(row) {
    return {
      travelerId: row.travelerId,
      travelerName: row.travelerName,
      base: portalPricingMoney_(row.base),
      amount: portalPricingMoney_(row.amount),
      capped: Boolean(row.capped),
      extra: portalPricingMoney_(row.extra),
      weighted: Boolean(row.weighted),
      policyAdjusted: Boolean(row.policyAdjusted)
    };
  });

  return {
    rows: publicRows,
    unresolved: portalPricingMoney_(remainder),
    total: portalPricingMoney_(total),
    covered: portalPricingMoney_(Math.max(0, total - remainder))
  };
}

function portalPricingAdultSplit_(travelers, totalCost) {
  const adults = portalPricingActiveAdults_(travelers);
  const total = Math.max(0, Number(totalCost || 0));

  // Match the established client calculation exactly. The legacy adult split
  // reports no unresolved amount when there is no usable adult/total basis.
  if (!adults.length || !total) {
    return {
      rows: [],
      unresolved: 0,
      total: portalPricingMoney_(total),
      covered: 0
    };
  }

  let totalWeight = adults.reduce(function(sum, traveler) {
    return sum + portalPricingCostPercent_(traveler) / 100;
  }, 0);

  const allZeroWeights = totalWeight <= 0;
  if (allZeroWeights) totalWeight = adults.length;

  const unit = total / totalWeight;

  return portalPricingRedistribute_(
    adults.map(function(traveler) {
      const weight = portalPricingCostPercent_(traveler) / 100;
      return {
        traveler: traveler,
        base: allZeroWeights ? unit : unit * weight
      };
    }),
    total
  );
}

function portalPricingBedroomSplit_(travelers, cabin, assignments, totalCost) {
  const adults = portalPricingActiveAdults_(travelers);
  const total = Math.max(0, Number(totalCost || 0));
  const bedrooms = cabin && Array.isArray(cabin.bedrooms)
    ? cabin.bedrooms
    : [];
  const bedroomCount = bedrooms.length || Number(cabin && cabin.Bedrooms || 0);

  if (!adults.length || !total || !bedroomCount) {
    return {
      rows: [],
      unresolved: portalPricingMoney_(total),
      total: portalPricingMoney_(total),
      covered: 0
    };
  }

  const cabinId = String(cabin && cabin['Cabin ID'] || '');
  const roomShare = total / bedroomCount;
  const adultMap = {};
  adults.forEach(function(traveler) {
    adultMap[String(traveler['Traveler ID'] || '')] = traveler;
  });

  const adultAssignmentMap = {};
  (assignments || []).forEach(function(assignment) {
    if (String(assignment['Cabin ID'] || '') !== cabinId) return;
    const travelerId = String(assignment['Traveler ID'] || '');
    if (!adultMap[travelerId]) return;
    adultAssignmentMap[travelerId] = String(assignment['Bedroom ID'] || '');
  });

  const baseByTraveler = {};
  adults.forEach(function(traveler) {
    baseByTraveler[String(traveler['Traveler ID'] || '')] = 0;
  });

  const bedroomIds = bedrooms.length
    ? bedrooms.map(function(room) {
        return String(room['Bedroom ID'] || '');
      }).filter(Boolean)
    : Array.from({length: bedroomCount}, function(_, index) {
        return 'ROOM-' + index;
      });

  bedroomIds.forEach(function(bedroomId) {
    const roomAdults = adults.filter(function(traveler) {
      return adultAssignmentMap[String(traveler['Traveler ID'] || '')] === bedroomId;
    });

    if (!roomAdults.length) return;

    let roomWeight = roomAdults.reduce(function(sum, traveler) {
      return sum + portalPricingCostPercent_(traveler) / 100;
    }, 0);

    const allZeroWeights = roomWeight <= 0;
    if (allZeroWeights) roomWeight = roomAdults.length;

    roomAdults.forEach(function(traveler) {
      const travelerId = String(traveler['Traveler ID'] || '');
      const weight = portalPricingCostPercent_(traveler) / 100;
      baseByTraveler[travelerId] += roomShare * (
        allZeroWeights
          ? 1 / roomAdults.length
          : weight / roomWeight
      );
    });
  });

  // Adults with no room assignment remain at $0. Empty-room balance can still
  // be absorbed by travelers whose private organizer policy allows it.
  return portalPricingRedistribute_(
    adults.map(function(traveler) {
      const travelerId = String(traveler['Traveler ID'] || '');
      return {
        traveler: traveler,
        base: Number(baseByTraveler[travelerId] || 0)
      };
    }),
    total
  );
}

function buildPortalPricingSnapshot_(payload) {
  payload = payload || {};
  const travelers = Array.isArray(payload.travelers) ? payload.travelers : [];
  const cabins = Array.isArray(payload.cabins) ? payload.cabins : [];
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
  const budget = Array.isArray(payload.budget) ? payload.budget : [];
  const extras = portalPricingIncludedExtras_(budget);
  const result = {};

  const configured = portalPricingActiveAdults_(travelers).some(function(traveler) {
    return portalPricingPriceCap_(traveler) > 0 ||
      portalPricingCostPercent_(traveler) !== 100 ||
      portalPricingWillPayMore_(traveler);
  });

  cabins.forEach(function(cabin) {
    const cabinId = String(cabin && cabin['Cabin ID'] || '');
    if (!cabinId) return;

    const rental = Math.max(0, Number(cabin['Total Rental Cost'] || 0));
    const total = rental + extras;

    // Store both exact totals instead of linearly scaling a derived split in
    // the browser. Caps and redistribution are not linear when shared extras
    // are toggled, so each supported total must be calculated server-side.
    const adult = portalPricingAdultSplit_(travelers, total);
    const bedroom = portalPricingBedroomSplit_(travelers, cabin, assignments, total);
    const adultRentalOnly = portalPricingAdultSplit_(travelers, rental);
    const bedroomRentalOnly = portalPricingBedroomSplit_(travelers, cabin, assignments, rental);

    result[cabinId] = {
      cabinId: cabinId,
      configured: configured,
      rentalTotal: portalPricingMoney_(rental),
      includedExtras: portalPricingMoney_(extras),
      splitTotal: portalPricingMoney_(total),
      adult: adult,
      bedroom: bedroom,
      adultRentalOnly: adultRentalOnly,
      bedroomRentalOnly: bedroomRentalOnly,
      summary: {
        cappedAdults: adult.rows.filter(function(row) {
          return row.capped;
        }).length,
        adjustedAdults: adult.rows.filter(function(row) {
          return row.policyAdjusted;
        }).length,
        adultUnresolved: adult.unresolved,
        bedroomUnresolved: bedroom.unresolved
      }
    };
  });

  return result;
}
