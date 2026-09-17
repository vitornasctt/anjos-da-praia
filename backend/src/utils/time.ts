// The operation takes place in Espirito Santo (UTC-03:00).
export const OPERATION_TIMEZONE = "America/Sao_Paulo";
export function operationHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: OPERATION_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
}
export function operationDayStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATION_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00-03:00`);
}
