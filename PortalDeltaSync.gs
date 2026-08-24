function getPortalDelta(sinceIso) {
  setupVacationPortalSilent_();

  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const sinceTime = isNaN(since.getTime()) ? 0 : since.getTime();

  function changedAfter_(value) {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.getTime() > sinceTime;
  }

  const cabins = readSheet_('Cabins').filter(function (row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  const votes = readSheet_('Votes');
  const comments = readSheet_('Comments');
  const favorites = readSheet_('Favorites');
  const assignments = readSheet_('Assignments');

  const changedIds = {};

  cabins.forEach(function (row) {
    if (changedAfter_(row['Updated At']) || changedAfter_(row['Created At'])) {
      changedIds[row['Cabin ID']] = true;
    }
  });

  [votes, comments, favorites, assignments].forEach(function (rows) {
    rows.forEach(function (row) {
      if (changedAfter_(row['Created At']) && row['Cabin ID']) {
        changedIds[row['Cabin ID']] = true;
      }
    });
  });

  const ids = Object.keys(changedIds);

  if (!ids.length) {
    return {
      cabins: [],
      votes: [],
      favorites: [],
      assignments: [],
      serverTime: new Date().toISOString()
    };
  }

  const travelers = normalizeTravelerRows_(readSheet_('Travelers'));
  const bedrooms = readSheet_('Bedrooms');
  const imports = readSheet_('Rental Import');
  const details = readSheet_('Cabin Details');
  const photos = readSheet_('Cabin Photos');
  const amenities = readSheet_('Cabin Amenities');
  const queue = readSheet_('Rental Import Queue');

  const travelerMap = {};
  travelers.forEach(function (traveler) {
    travelerMap[traveler['Traveler ID']] = traveler;
  });

  const changedCabins = cabins
    .filter(function (cabin) {
      return Boolean(changedIds[cabin['Cabin ID']]);
    })
    .map(function (cabin) {
      const cabinId = cabin['Cabin ID'];
      const cabinVotes = votes.filter(function (vote) {
        return vote['Cabin ID'] === cabinId;
      });

      const scores = cabinVotes
        .map(function (vote) { return Number(vote.Score || 0); })
        .filter(function (score) { return isFinite(score); });

      const detail = details.slice().reverse().find(function (row) {
        return row['Cabin ID'] === cabinId;
      }) || null;

      const cabinPhotos = photos
        .filter(function (row) { return row['Cabin ID'] === cabinId; })
        .sort(function (left, right) {
          return Number(left['Sort Order'] || 0) -
            Number(right['Sort Order'] || 0);
        });

      const latestImport = imports.slice().reverse().find(function (row) {
        return row['Cabin ID'] === cabinId;
      }) || null;

      const queueItem = queue.slice().reverse().find(function (row) {
        return row['Cabin ID'] === cabinId &&
          [
            'Quick Queued',
            'Quick Processing',
            'Quick Error',
            'Enrichment Queued',
            'Enriching',
            'Enrichment Error',
            'Quota Waiting'
          ].indexOf(String(row.Status || '')) >= 0;
      }) || null;

      return Object.assign({}, cabin, {
        bedrooms: bedrooms.filter(function (bedroom) {
          return bedroom['Cabin ID'] === cabinId;
        }),
        comments: comments
          .filter(function (comment) {
            return comment['Cabin ID'] === cabinId;
          })
          .map(function (comment) {
            return Object.assign({}, comment, {
              travelerName: travelerMap[comment['Traveler ID']]
                ? travelerMap[comment['Traveler ID']].Name
                : comment['Traveler ID']
            });
          }),
        favoriteCount: favorites.filter(function (favorite) {
          return favorite['Cabin ID'] === cabinId;
        }).length,
        voteCount: scores.length,
        averageScore: scores.length
          ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length
          : 0,
        import: latestImport,
        queue: queueItem,
        detail: detail,
        photos: cabinPhotos,
        amenityRows: amenities.filter(function (row) {
          return row['Cabin ID'] === cabinId;
        })
      });
    });

  return {
    cabins: changedCabins,
    votes: votes.filter(function (row) {
      return Boolean(changedIds[row['Cabin ID']]);
    }),
    favorites: favorites.filter(function (row) {
      return Boolean(changedIds[row['Cabin ID']]);
    }),
    assignments: assignments.filter(function (row) {
      return Boolean(changedIds[row['Cabin ID']]);
    }),
    serverTime: new Date().toISOString()
  };
}
