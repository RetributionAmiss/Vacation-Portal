function deletePlannerComment(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const commentId = String(values.commentId || '').trim();
  const plannerType = String(values.plannerType || '').trim();
  const requesterTravelerId = String(values.travelerId || '').trim();

  if (!commentId) throw new Error('Choose a comment first.');
  if (plannerType && ['Itinerary', 'Meals'].indexOf(plannerType) < 0) {
    throw new Error('Comments are not available for that planning section.');
  }

  return withPortalMutationLock_(function() {
    const comment = readSheet_('Planner Comments').find(function(row) {
      return String(row['Planner Comment ID'] || '') === commentId;
    }) || null;

    if (!comment) {
      return {ok: true, commentId: commentId, alreadyRemoved: true};
    }

    const actualPlannerType = String(comment['Planner Type'] || '').trim();
    if (plannerType && actualPlannerType !== plannerType) {
      throw new Error('That comment belongs to a different planning section.');
    }

    const ownerTravelerId = String(comment['Traveler ID'] || '').trim();
    if (requesterTravelerId && requesterTravelerId === ownerTravelerId) {
      assertTravelerSelf_(values.deviceId, requesterTravelerId);
    } else {
      // Organizer removal is asserted centrally on the server. Client state,
      // traveler name, Planning As, and device identity never grant this path.
      assertOrganizerFromValues_(values);
    }

    deleteById_('Planner Comments', 'Planner Comment ID', commentId);
    return {
      ok: true,
      commentId: commentId,
      plannerType: actualPlannerType,
      itemId: String(comment['Item ID'] || ''),
      travelerId: ownerTravelerId
    };
  });
}
