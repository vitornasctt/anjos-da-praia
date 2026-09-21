import cron from "node-cron";
import { serializable } from "../lib/transaction";
import { audit } from "../utils/audit";
import { OPERATION_TIMEZONE } from "../utils/time";
import { HttpError } from "../utils/httpError";

export const ANONYMIZED_LABEL = "[dado removido - retencao LGPD]";
export const FINAL: string[] = ["REENCONTRO_REALIZADO", "CANCELADA"];

type RetentionIncident = { status: string; resolvedAt: Date | null; statusHistory: { newStatus: string; changedAt: Date }[] };
export function incidentExpired(incident: RetentionIncident, cutoff: Date): boolean {
  if (!FINAL.includes(incident.status)) return false;
  // Legacy cancellations use their recorded closing transition, never creation.
  const endedAt = incident.resolvedAt ?? incident.statusHistory
    .filter((h) => FINAL.includes(h.newStatus))
    .reduce<Date | null>((latest, h) => !latest || h.changedAt > latest ? h.changedAt : latest, null);
  return endedAt !== null && endedAt < cutoff;
}

export async function purgeOldPersonalData(retentionDays: number) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new HttpError(400, "Prazo de retencao invalido.");
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  return serializable(async (tx) => {
    const families = await tx.family.findMany({
      where: { createdAt: { lt: cutoff } },
      include: { children: { include: { wristbands: { include: { incidents: { include: { statusHistory: true } } } } } } },
    });
    let anonymizedFamilies = 0;
    let anonymizedChildren = 0;
    for (const family of families) {
      // Keep the entire family while any child still needs recent/active care.
      const eligible = family.children.every((child) => child.createdAt < cutoff && child.wristbands.every((band) =>
        band.createdAt < cutoff && band.incidents.every((incident) => incidentExpired(incident, cutoff))
      ));
      if (!eligible) continue;
      const childIds = family.children.map((child) => child.id);
      const wristbandIds = family.children.flatMap((child) => child.wristbands.map((band) => band.id));
      await tx.wristband.updateMany({ where: { childId: { in: childIds }, status: { not: "ENCERRADA" } }, data: { status: "ENCERRADA" } });
      // Telefone de quem encontrou a crianca tambem e dado pessoal: some junto.
      await tx.incident.updateMany({ where: { wristbandId: { in: wristbandIds }, finderPhone: { not: null } }, data: { finderPhone: null } });
      const children = await tx.child.updateMany({
        where: { id: { in: childIds }, OR: [{ firstName: { not: ANONYMIZED_LABEL } }, { optionalIdentificationNote: { not: null } }, { photoUrl: { not: null } }] },
        data: { firstName: ANONYMIZED_LABEL, optionalIdentificationNote: null, photoUrl: null },
      });
      anonymizedChildren += children.count;
      if (family.responsibleName !== ANONYMIZED_LABEL || family.responsiblePhone !== ANONYMIZED_LABEL || family.responsibleAddress) {
        await tx.family.update({ where: { id: family.id }, data: { responsibleName: ANONYMIZED_LABEL, responsiblePhone: ANONYMIZED_LABEL, responsibleAddress: null } });
        anonymizedFamilies++;
      }
    }
    if (anonymizedFamilies || anonymizedChildren) await audit(null, "ANONYMIZE_RETENTION", "Family", String(anonymizedFamilies), tx);
    return { anonymizedFamilies, anonymizedChildren, cutoff };
  });
}

export function startRetentionSchedule() {
  cron.schedule("0 3 * * *", () => {
    purgeOldPersonalData(Number(process.env.DATA_RETENTION_DAYS ?? 90)).catch(() => console.error("Falha na rotina de retencao de dados."));
  }, { timezone: OPERATION_TIMEZONE });
}
