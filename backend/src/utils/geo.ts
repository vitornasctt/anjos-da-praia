// Distancia aproximada entre dois pontos (formula de haversine), usada
// para identificar a tenda mais proxima de uma ocorrencia (item 13/24).
export function distanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findNearestTent<T extends { latitude: number; longitude: number }>(
  point: { latitude: number; longitude: number },
  tents: T[]
): { tent: T; distanceMeters: number } | null {
  if (tents.length === 0) return null;
  let nearest = tents[0];
  let nearestDistance = distanceInMeters(point.latitude, point.longitude, tents[0].latitude, tents[0].longitude);
  for (const tent of tents.slice(1)) {
    const d = distanceInMeters(point.latitude, point.longitude, tent.latitude, tent.longitude);
    if (d < nearestDistance) {
      nearest = tent;
      nearestDistance = d;
    }
  }
  return { tent: nearest, distanceMeters: nearestDistance };
}
