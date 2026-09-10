/**
 * Haversine formula: computes great-circle distance between two GPS points.
 * Used to sum up distance between consecutive tracked location points.
 */
function toRad(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(coord1, coord2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Minimum segment length in km.  Segments shorter than this are treated as
 * GPS noise (jitter) and discarded.  5 m (0.005 km) is below the accuracy
 * of consumer GPS hardware, so any movement smaller than that is almost
 * certainly random drift rather than real travel.
 */
const MIN_SEGMENT_KM = 0.005;

/**
 * Stationary cluster radius in km.  Consecutive points that all fall within
 * this radius of the cluster centroid are collapsed to a single point.
 * This eliminates GPS drift while the device is parked / stopped (traffic
 * lights, destination site, etc.) which would otherwise inflate the
 * reported distance.
 */
const STATIONARY_RADIUS_KM = 0.015; // ~15 m

/**
 * Walk pace in km/h — used as the lower bound for plausible movement.
 * If the average implied speed between a group of consecutive points is
 * below this threshold the group is considered stationary and collapsed.
 */
const MIN_PLAUSIBLE_SPEED_KMH = 1.5;

/**
 * Moving-average window size for path smoothing.
 *
 * Consumer GPS has ±5-8 m jitter that makes consecutive points zigzag
 * around the true path, inflating the summed Haversine distance.  Averaging
 * each point with its neighbours reduces perpendicular noise by ~√N and
 * produces effective segments that are N × interval_m long — well above
 * the noise floor — so the per-segment over-counting drops dramatically.
 *
 * A window of 5 on 10 m samples creates ~50 m effective segments with
 * noise reduced from ~8 m to ~3.6 m, yielding <3% per-segment error.
 */
const SMOOTHING_WINDOW = 5;

/**
 * Apply a centred moving-average to lat/lon coordinates.
 *
 * Reduces GPS jitter while preserving the overall path shape.  Timestamps
 * are taken from the centre point of each window so they stay in order.
 *
 * @param {Array<{latitude: number, longitude: number}>} points
 * @param {number} windowSize - must be odd (floored to odd if even)
 * @returns {Array} smoothed array (same length as input)
 */
function smoothPath(points, windowSize = SMOOTHING_WINDOW) {
  if (points.length <= windowSize) return points;
  // Ensure odd window for symmetry.
  const w = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const half = Math.floor(w / 2);
  return points.map((pt, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    let latSum = 0;
    let lonSum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      latSum += points[j].latitude;
      lonSum += points[j].longitude;
      count++;
    }
    return {
      latitude: latSum / count,
      longitude: lonSum / count,
      timestamp: pt.timestamp,
    };
  });
}

/**
 * Given an array of {latitude, longitude} points recorded during tracking,
 * sum the distance between consecutive points.
 *
 * The function applies three noise-reduction steps before summing:
 *
 * 1. **Moving-average smoothing** — reduces perpendicular GPS jitter by
 *    averaging each fix with its neighbours, producing cleaner segments
 *    whose lengths are well above the noise floor.
 *
 * 2. **Stationary-point collapsing** — consecutive GPS fixes that all fall
 *    within a small radius and whose implied speed is below walking pace
 *    are collapsed to a single representative point.  This eliminates the
 *    "GPS drift" that inflates distance while the device is stopped.
 *
 * 3. **Minimum-segment filtering** — individual segments shorter than 5 m
 *    are discarded as GPS jitter (well below consumer-GPS accuracy).
 *
 * Together these three steps remove the systematic over-counting that
 * consumer GPS noise causes on longer trips while preserving the actual
 * travel distance to within a few percent.
 */
export function calculateRouteDistanceKm(points = []) {
  if (points.length < 2) return 0;

  const smoothed = smoothPath(points);
  const simplified = collapseStationaryClusters(smoothed);

  let total = 0;
  for (let i = 1; i < simplified.length; i++) {
    const seg = haversineDistanceKm(simplified[i - 1], simplified[i]);
    if (seg >= MIN_SEGMENT_KM) {
      total += seg;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Collapse groups of consecutive stationary points into single points.
 *
 * Walks forward through the array accumulating a "window" of points.  As
 * long as every point in the window stays within STATIONARY_RADIUS_KM of
 * the window's first point *and* the implied average speed stays below
 * MIN_PLAUSIBLE_SPEED_KMH, points keep being absorbed.  Once a point
 * breaks out of the window the centroid of the absorbed cluster is emitted
 * as one point and a fresh window starts.
 *
 * This is an O(n) single-pass algorithm with no allocations beyond the
 * output array — safe for the thousands of points a long trip can produce.
 */
function collapseStationaryClusters(points) {
  if (points.length <= 2) return points;

  const result = [];
  let i = 0;

  while (i < points.length) {
    const clusterStart = points[i];
    let latSum = clusterStart.latitude;
    let lonSum = clusterStart.longitude;
    let clusterLen = 1;
    let j = i + 1;

    // Keep absorbing while every new point stays within the radius
    // and the overall implied speed is below walking pace.
    while (j < points.length) {
      const candidate = points[j];
      const centroid = {
        latitude: latSum / clusterLen,
        longitude: lonSum / clusterLen,
      };
      const dist = haversineDistanceKm(centroid, candidate);

      if (dist > STATIONARY_RADIUS_KM) break;

      // Check implied speed from cluster start to this candidate.
      const tStart = clusterStart.timestamp || points[i].timestamp;
      const tEnd = candidate.timestamp || points[j].timestamp;
      if (tStart && tEnd) {
        const dtHrs = (tEnd - tStart) / 3_600_000;
        if (dtHrs > 0) {
          const totalDist = haversineDistanceKm(clusterStart, candidate);
          const speedKmh = totalDist / dtHrs;
          if (speedKmh > MIN_PLAUSIBLE_SPEED_KMH) break;
        }
      }

      latSum += candidate.latitude;
      lonSum += candidate.longitude;
      clusterLen++;
      j++;
    }

    if (clusterLen === 1) {
      result.push(clusterStart);
    } else {
      // Emit the centroid of the cluster (representative stationary point).
      result.push({
        latitude: latSum / clusterLen,
        longitude: lonSum / clusterLen,
        timestamp: clusterStart.timestamp,
      });
    }

    i = j;
  }

  return result;
}

export function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return '0h 0m';
  const ms = new Date(endTime) - new Date(startTime);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Merge background-recorded points with foreground-collected points.
 *
 * Background points are preferred because they survive foreground/background
 * transitions reliably.  But foreground may have captured a few points before
 * the background task started (or after it stopped), so any foreground points
 * whose timestamps fall outside the background range are prepended/appended.
 *
 * If there are no background points (e.g. running in Expo Go), all foreground
 * points are used as-is.
 *
 * @param {Array} backgroundPoints - points from AsyncStorage route history
 * @param {Array} foregroundPoints - points from React state (watchPositionAsync)
 * @returns {Array} merged array of {latitude, longitude} points
 */
export function mergePoints(backgroundPoints = [], foregroundPoints = []) {
  // Normalise to plain {latitude, longitude} objects.
  const bg = backgroundPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp }));
  const fg = foregroundPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp }));

  if (bg.length === 0) return fg;
  if (fg.length === 0) return bg;

  // Find the time range covered by the background set.
  const bgTimes = bg.filter((p) => p.timestamp).map((p) => p.timestamp);
  if (bgTimes.length === 0) return bg;
  const bgMin = Math.min(...bgTimes);
  const bgMax = Math.max(...bgTimes);

  // Foreground points before the first background point (captured before
  // the background task started) or after the last background point
  // (captured after the background task stopped).
  const fgBefore = fg.filter((p) => p.timestamp && p.timestamp < bgMin);
  const fgAfter  = fg.filter((p) => p.timestamp && p.timestamp > bgMax);

  return [...fgBefore, ...bg, ...fgAfter];
}
