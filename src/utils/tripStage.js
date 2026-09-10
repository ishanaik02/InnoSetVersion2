// The Round Trip / Stay Trip screens drive their UI off a local `stage`
// variable (idle -> outbound -> at_site -> returning -> completed). That
// variable used to only ever start at 'idle', so if the app was closed or
// the engineer navigated away mid-trip, reopening it always looked like a
// brand new trip — even though the server already had a startTime/siteReachedTime
// recorded.
//
// The four timestamps on the trip document are a reliable, order-dependent
// record of how far the trip actually got, so we can reconstruct the stage
// from them instead of assuming 'idle'.
export function deriveStageFromTrip(trip) {
  if (!trip) return 'idle';
  if (trip.endTime) return 'completed';
  if (trip.visitCompletedTime) return 'returning';
  if (trip.siteReachedTime) return 'at_site';
  if (trip.startTime) return 'outbound';
  return 'idle';
}

// A trip can only be safely resumed into the tracking screens (Round/Stay)
// while it hasn't been submitted yet — once submitted, the office has the
// figures and it becomes a read-only record.
export const RESUMABLE_STATUSES = ['draft', 'in_progress', 'at_site', 'returning'];
export const DELETABLE_STATUSES = ['draft', 'in_progress', 'at_site', 'returning', 'completed'];
