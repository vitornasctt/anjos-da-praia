import { AlertTriangle, Footprints, HeartHandshake, PhoneCall, PartyPopper, XCircle, type LucideIcon } from "lucide-react";
import { IncidentStatus } from "../types";

const STATUS_META: Record<IncidentStatus, { label: string; icon: LucideIcon; className: string; iconClassName: string }> = {
  CRIANCA_LOCALIZADA: {
    label: "Criança localizada",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-700 border-red-200",
    iconClassName: "text-red-600",
  },
  EQUIPE_A_CAMINHO: {
    label: "Equipe a caminho",
    icon: Footprints,
    className: "bg-orange-50 text-orange-700 border-orange-200",
    iconClassName: "text-orange-600",
  },
  CRIANCA_RECEBIDA_PELA_EQUIPE: {
    label: "Criança recebida pela equipe",
    icon: HeartHandshake,
    className: "bg-yellow-50 text-yellow-800 border-yellow-200",
    iconClassName: "text-yellow-700",
  },
  RESPONSAVEIS_LOCALIZADOS: {
    label: "Responsáveis localizados",
    icon: PhoneCall,
    className: "bg-ocean-50 text-ocean-700 border-ocean-200",
    iconClassName: "text-ocean-600",
  },
  REENCONTRO_REALIZADO: {
    label: "Reencontro realizado",
    icon: PartyPopper,
    className: "bg-green-50 text-green-700 border-green-200",
    iconClassName: "text-green-600",
  },
  CANCELADA: {
    label: "Ocorrência cancelada",
    icon: XCircle,
    className: "bg-gray-100 text-gray-600 border-gray-200",
    iconClassName: "text-gray-500",
  },
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${meta.className}`}
    >
      <Icon className={`h-4 w-4 ${meta.iconClassName}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export { STATUS_META };
