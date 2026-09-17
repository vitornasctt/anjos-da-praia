import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { apiRequest } from "../../services/api";
import { getSocket } from "../../services/socket";
import { Incident, IncidentSummary } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";

// O WebSocket cobre o caso comum (atualizacao quase instantanea); o
// polling continua como rede de seguranca caso a conexao em tempo real
// caia, por isso o intervalo pode ser mais espaçado do que antes.
const POLL_INTERVAL_MS = 20000;

type FilterKey = "open" | "enRoute" | "inService" | "resolvedToday";

const FILTER_LABEL: Record<FilterKey, string> = {
  open: "Ocorrências abertas",
  enRoute: "Equipe a caminho",
  inService: "Em atendimento",
  resolvedToday: "Reencontros hoje",
};

// Mesma regra do backend (rota /incidents/summary) para o "dia de
// operacao" comecar a meia-noite no horario de Brasilia, independente
// do fuso do navegador de quem estiver olhando o painel.
function operationDayStartMs(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00-03:00`).getTime();
}

function isFinalStatus(status: Incident["status"]): boolean {
  return status === "REENCONTRO_REALIZADO" || status === "CANCELADA";
}

// Ocorrencias finalizadas (reencontro ou cancelada) em dias anteriores ficam
// fora da lista por padrao, para o Painel nao virar uma rolagem infinita -
// mas continuam disponiveis via o link "Ver historico completo".
function isOldFinalized(incident: Incident, todayStartMs: number): boolean {
  return (
    isFinalStatus(incident.status) &&
    (incident.resolvedAt == null || new Date(incident.resolvedAt).getTime() < todayStartMs)
  );
}

function matchesFilter(incident: Incident, key: FilterKey): boolean {
  switch (key) {
    case "open":
      return incident.status === "CRIANCA_LOCALIZADA";
    case "enRoute":
      return incident.status === "EQUIPE_A_CAMINHO";
    case "inService":
      return incident.status === "CRIANCA_RECEBIDA_PELA_EQUIPE" || incident.status === "RESPONSAVEIS_LOCALIZADOS";
    case "resolvedToday":
      return (
        incident.status === "REENCONTRO_REALIZADO" &&
        incident.resolvedAt != null &&
        new Date(incident.resolvedAt).getTime() >= operationDayStartMs()
      );
  }
}

export function DashboardPage() {
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const realtimeAvailable = Boolean(getSocket());

  function toggleFilter(key: FilterKey) {
    setFilter((current) => (current === key ? null : key));
  }

  const oldFinalizedCount = useMemo(() => {
    const todayStart = operationDayStartMs();
    return incidents.filter((incident) => isOldFinalized(incident, todayStart)).length;
  }, [incidents]);

  const visibleIncidents = useMemo(() => {
    if (filter) return incidents.filter((incident) => matchesFilter(incident, filter));
    if (showHistory) return incidents;
    const todayStart = operationDayStartMs();
    return incidents.filter((incident) => !isOldFinalized(incident, todayStart));
  }, [incidents, filter, showHistory]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryData, incidentsData] = await Promise.all([
          apiRequest<IncidentSummary>("/incidents/summary"),
          apiRequest<Incident[]>("/incidents"),
        ]);
        if (!cancelled) {
          setSummary(summaryData);
          setIncidents(incidentsData);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Não foi possível atualizar os dados agora.");
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);

    const socket = getSocket();
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);
    if (socket) {
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("incident:created", load);
      socket.on("incident:updated", load);
      if (socket.connected) setLive(true);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (socket) {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("incident:created", load);
        socket.off("incident:updated", load);
      }
    };
  }, []);

  const isNew = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 60000;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
          <LayoutDashboard className="h-6 w-6 text-ocean-600" aria-hidden="true" />
          Painel de ocorrências
        </h1>
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            live ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
          title={live ? "Atualizações em tempo real ativas" : "Atualizando por intervalo (sem tempo real)"}
        >
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-gray-400"}`} aria-hidden="true" />
          {live ? "Ao vivo" : realtimeAvailable ? "Reconectando..." : "Atualiza a cada 20s"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Ocorrências abertas"
          value={summary?.open}
          tone="red"
          active={filter === "open"}
          onClick={() => toggleFilter("open")}
        />
        <SummaryCard
          label="Equipe a caminho"
          value={summary?.enRoute}
          tone="orange"
          active={filter === "enRoute"}
          onClick={() => toggleFilter("enRoute")}
        />
        <SummaryCard
          label="Em atendimento"
          value={summary?.inService}
          tone="yellow"
          active={filter === "inService"}
          onClick={() => toggleFilter("inService")}
        />
        <SummaryCard
          label="Reencontros hoje"
          value={summary?.resolvedToday}
          tone="green"
          active={filter === "resolvedToday"}
          onClick={() => toggleFilter("resolvedToday")}
        />
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}

      {filter && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ocean-700">
          <span>
            Filtrando por: <strong>{FILTER_LABEL[filter]}</strong> ({visibleIncidents.length})
          </span>
          <button onClick={() => setFilter(null)} className="font-medium text-ocean-600 underline">
            Limpar filtro
          </button>
        </div>
      )}

      {!filter && oldFinalizedCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowHistory((current) => !current)}
            className="text-sm font-medium text-ocean-600 underline"
          >
            {showHistory
              ? "Ocultar ocorrências de dias anteriores"
              : `Ver histórico completo (+${oldFinalizedCount} de dias anteriores)`}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {visibleIncidents.length === 0 && (
          <p className="rounded-lg border border-dashed border-ocean-200 bg-white p-6 text-center text-ocean-500">
            {filter ? "Nenhuma ocorrência nesse status no momento." : "Nenhuma ocorrência registrada ainda."}
          </p>
        )}
        {visibleIncidents.map((incident) => (
          <Link
            key={incident.id}
            to={`/painel/ocorrencias/${incident.id}`}
            className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
              isNew(incident.createdAt) ? "border-red-300 ring-2 ring-red-200" : "border-ocean-100"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-ocean-900">
                  Pulseira #{incident.wristband?.printedNumber}
                </span>
                {isNew(incident.createdAt) && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    NOVA
                  </span>
                )}
              </div>
              <StatusBadge status={incident.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ocean-600">
              <span>{new Date(incident.createdAt).toLocaleString("pt-BR")}</span>
              {incident.beach && <span>{incident.beach.name}</span>}
              {incident.assignedTeam && <span>Equipe: {incident.assignedTeam.name}</span>}
              {incident.latitude != null && incident.longitude != null && (
                <span>
                  {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | undefined;
  tone: "red" | "orange" | "yellow" | "green";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    red: "border-red-200 bg-red-50 text-red-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    green: "border-green-200 bg-green-50 text-green-700",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filtrar por ${label}: ${value ?? 0}`}
      className={`rounded-xl border p-4 text-left transition hover:shadow-md ${toneClass} ${
        active ? "ring-2 ring-offset-1 ring-ocean-600" : ""
      }`}
    >
      <div className="text-3xl font-bold" aria-hidden="true">{value ?? "–"}</div>
      <div className="text-sm font-medium" aria-hidden="true">{label}</div>
    </button>
  );
}
