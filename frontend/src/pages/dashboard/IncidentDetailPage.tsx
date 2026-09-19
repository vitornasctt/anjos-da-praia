import { getSocket } from "../../services/socket";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest, ApiError } from "../../services/api";
import { Incident, IncidentStatus, Team } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { useAuth } from "../../context/AuthContext";

const STATUS_ORDER: IncidentStatus[] = [
  "CRIANCA_LOCALIZADA",
  "EQUIPE_A_CAMINHO",
  "CRIANCA_RECEBIDA_PELA_EQUIPE",
  "RESPONSAVEIS_LOCALIZADOS",
  "REENCONTRO_REALIZADO",
];

// Mesmo rotulo usado pelo backend ao anonimizar dados por retencao LGPD
// (ver backend/src/jobs/dataRetention.ts) - permite trocar a repeticao do
// texto cru por um aviso unico e mais legivel.
const ANONYMIZED_LABEL = "[dado removido - retencao LGPD]";

const NEXT_ACTION_LABEL: Partial<Record<IncidentStatus, string>> = {
  CRIANCA_LOCALIZADA: "Confirmar: equipe a caminho",
  EQUIPE_A_CAMINHO: "Confirmar: criança recebida pela equipe",
  CRIANCA_RECEBIDA_PELA_EQUIPE: "Confirmar: responsáveis localizados",
  RESPONSAVEIS_LOCALIZADOS: "Confirmar reencontro realizado",
};

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const selectionDirty = useRef(false);
  const requestVersion = useRef(0);

  async function load(resetSelection = false) {
    const version = ++requestVersion.current;
    if (!id) return;
    try {
      const data = await apiRequest<Incident>(`/incidents/${id}`);
      if (version !== requestVersion.current) return;
      setIncident(data);
      setError(null);
      if (resetSelection || !selectionDirty.current) { setSelectedTeamId(data.assignedTeamId ?? ""); selectionDirty.current = false; }
    } catch {
      if (version !== requestVersion.current) return;
      setError("Não foi possível carregar a ocorrência.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    selectionDirty.current = false;
    setIncident(null);
    const refresh = async () => {
      if (loading || cancelled) return;
      loading = true;
      await load();
      try {
        const data = await apiRequest<Team[]>("/teams");
        if (!cancelled) setTeams(data);
      } catch { if (!cancelled) setError("Não foi possível atualizar as equipes."); }
      finally { loading = false; }
    };
    refresh();
    const timer = setInterval(refresh, 20000);
    const socket = getSocket();
    socket?.on("incident:updated", refresh);
    return () => { cancelled = true; ++requestVersion.current; clearInterval(timer); socket?.off("incident:updated", refresh); };
  }, [id]);

  async function updateStatus(status: IncidentStatus) {
    if (!id) return;
    setUpdating(true);
    setError(null);
    try {
      await apiRequest(`/incidents/${id}/status`, {
        method: "PATCH",
        body: { status, assignedTeamId: selectedTeamId || undefined },
      });
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setUpdating(false);
    }
  }

  if (error && !incident) {
    return (
      <div role="alert" className="space-y-3">
        <Link to="/painel" className="text-sm font-medium text-ocean-600 underline">← Voltar ao painel</Link>
        <p className="text-red-600">{error}</p>
        <button onClick={() => load(true)} className="text-sm font-medium text-ocean-600 underline">Tentar novamente</button>
      </div>
    );
  }
  if (!incident) {
    return (
      <div className="space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Carregando ocorrência...</span>
        <Skeleton className="h-5 w-32" />
        <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
          <Skeleton className="h-4 w-56" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  const nextStatus = STATUS_ORDER[STATUS_ORDER.indexOf(incident.status) + 1];
  const isFinal = incident.status === "REENCONTRO_REALIZADO" || incident.status === "CANCELADA";
  const mapUrl =
    incident.latitude != null && incident.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=17/${incident.latitude}/${incident.longitude}`
      : null;

  return (
    <div className="space-y-6">
      <Link to="/painel" className="text-sm font-medium text-ocean-600 underline">
        ← Voltar ao painel
      </Link>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ocean-900">
            Pulseira #{incident.wristband?.printedNumber}
          </h1>
          <span role="status" aria-live="polite">
            <StatusBadge status={incident.status} />
          </span>
        </div>
        <p className="mt-1 text-sm text-ocean-600">
          Alerta enviado em {new Date(incident.createdAt).toLocaleString("pt-BR")}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Section title="Localização">
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noreferrer" className="font-medium text-ocean-600 underline">
                Ver no mapa (precisão {incident.locationAccuracy != null ? `${Math.round(incident.locationAccuracy)}m` : "desconhecida"})
              </a>
            ) : (
              <p>
                {incident.beach ? (
                  incident.beachTent ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${incident.beachTent.latitude}&mlon=${incident.beachTent.longitude}#map=16/${incident.beachTent.latitude}/${incident.beachTent.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Sem GPS do achado - abre o mapa na tenda de apoio desta praia, como referência aproximada."
                      className="font-medium text-ocean-600 underline"
                    >
                      {incident.beach.name}
                    </a>
                  ) : (
                    incident.beach.name
                  )
                ) : (
                  "Praia não informada"
                )}
                {incident.referencePoint && ` — ${incident.referencePoint}`}
              </p>
            )}
            {incident.nearestTent && (
              <p className="mt-1 text-sm text-ocean-600">
                Tenda mais próxima: <strong>{incident.nearestTent.name}</strong> (~
                {incident.nearestTent.distanceMeters < 1000
                  ? `${incident.nearestTent.distanceMeters} m`
                  : `${(incident.nearestTent.distanceMeters / 1000).toFixed(1)} km`}
                )
              </p>
            )}
          </Section>

          <Section title="Dados para a equipe">
            {incident.wristband?.child?.firstName === ANONYMIZED_LABEL ? (
              <p className="rounded-lg bg-ocean-50 px-3 py-2 text-sm italic text-ocean-500">
                Dados pessoais apagados por política de retenção (LGPD).
              </p>
            ) : (
              <>
                {incident.wristband?.child?.photoUrl && (
                  <img
                    src={incident.wristband.child.photoUrl}
                    alt={`Foto de ${incident.wristband.child.firstName}`}
                    className="mb-2 h-24 w-24 rounded-lg border border-ocean-200 object-cover"
                  />
                )}
                <p className="font-medium">Criança: {incident.wristband?.child?.firstName ?? "—"}</p>
                {incident.wristband?.child?.optionalIdentificationNote && (
                  <p className="text-sm text-ocean-600">{incident.wristband.child.optionalIdentificationNote}</p>
                )}
                <p className="mt-2">
                  Responsável: {incident.wristband?.child?.family?.responsibleName ?? "—"}
                </p>
                <p>Telefone: {incident.wristband?.child?.family?.responsiblePhone ?? "—"}</p>
                {incident.wristband?.child?.family?.responsibleAddress && (
                  <p>Endereço: {incident.wristband.child.family.responsibleAddress}</p>
                )}
              </>
            )}
          </Section>
        </div>

        <div className="mt-5">
          <Section title="Equipe responsável">
            <label htmlFor="assignedTeam" className="sr-only">
              Equipe responsável
            </label>
            <select
              id="assignedTeam"
              value={selectedTeamId}
              onChange={(e) => { selectionDirty.current = true; setSelectedTeamId(e.target.value); }}
              disabled={isFinal || updating}
              className="w-full max-w-xs rounded-lg border border-ocean-200 px-3 py-2"
            >
              <option value="">Sem equipe atribuída</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Section>
        </div>

        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}

        {!isFinal && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {nextStatus && (
              <button
                onClick={() => updateStatus(nextStatus)}
                disabled={updating}
                className="flex-1 rounded-xl bg-ocean-600 px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-ocean-700 disabled:opacity-60"
              >
                {updating ? "Atualizando..." : NEXT_ACTION_LABEL[incident.status]}
              </button>
            )}
            {user?.role === "ADMIN" && (
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={updating}
                title="Encerra o atendimento sem reencontro. Não pode ser desfeito."
                className="rounded-xl border-2 border-red-300 px-6 py-4 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Cancelar ocorrência
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Histórico</h2>
        <ul className="space-y-2 text-sm">
          {incident.statusHistory?.map((h) => (
            <li key={h.id} className="flex justify-between border-b border-ocean-50 pb-2">
              <span>{h.newStatus.replaceAll("_", " ")}</span>
              <span className="text-ocean-500">
                {new Date(h.changedAt).toLocaleString("pt-BR")} {h.changedBy && `· ${h.changedBy.name}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar ocorrência"
        description={`Encerrar o atendimento da pulseira #${incident.wristband?.printedNumber} sem reencontro? A equipe deixará de acompanhar este caso e isso não pode ser desfeito.`}
        confirmLabel="Cancelar ocorrência"
        busy={updating}
        onConfirm={async () => { await updateStatus("CANCELADA"); setConfirmCancel(false); }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ocean-500">{title}</h3>
      <div className="text-ocean-900">{children}</div>
    </div>
  );
}
