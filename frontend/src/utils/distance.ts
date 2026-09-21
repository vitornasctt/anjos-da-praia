// Distancia legivel: "850 m" abaixo de 1 km, "3,4 km" a partir de 1 km.
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
