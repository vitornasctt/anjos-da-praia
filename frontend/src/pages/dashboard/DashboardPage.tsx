import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, Search, X } from "lucide-react";
import { apiRequest } from "../../services/api";
import { getSocket } from "../../services/socket";
import { Incident, IncidentSummary, Page } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { Spinner } from "../../components/Spinner";
import { SkeletonStatCards, SkeletonRows } from "../../components/Skeleton";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// O WebSocket cobre o caso comum (atualizacao quase instantanea); o
// polling continua como rede de seguranca caso a conexao em tempo real
// caia, por isso o intervalo pode ser mais espaçado do que antes.
const POLL_INTERVAL_MS = 20000;
const PAGE_SIZE = 20;

type FilterKey = "open" | "enRoute" | "inService" | "resolvedToday";

const FILTER_LABEL: Record<FilterKey, string> = {
  open: "Ocorrências abertas",
  enRoute: "Equipe a caminho",
  inService: "Em atendimento",
  resolvedToday: "Reencontros hoje",
};

export function DashboardPage() {
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const realtimeAvailable = Boolean(getSocket());
  const requestVersion = useRef(0);

  function toggleFilter(key: FilterKey) {
    setFilter((current) => (current === key ? null : key));
  }

  function buildParams(cursor?: string) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    if (filter) params.set("filter", filter);
    else if (showHistory) params.set("includeHistory", "true");
    if (search) params.set("search", search);
    return params;
  }

  // Reseta e busca a primeira pagina - usado ao entrar na tela e sempre
  // que filtro, busca ou "ver historico" mudam (preservando so o que faz
  // sentido preservar: trocar de visao começa uma nova lista).
  async function resetAndLoad() {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await apiRequest<Page<Incident>>(`/incidents?${buildParams().toString()}`);
      if (version !== requestVersion.current) return;
      setError(null);
      setItems(result.items);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch {
      if (version !== requestVersion.current) return;
      setError("Não foi possível carregar as ocorrências.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  // Atualizacao ao vivo (polling + socket): busca so a primeira pagina e
  // mescla no que ja esta carregado - atualiza status de itens visiveis e
  // traz ocorrencias novas pro topo, sem re-buscar a tabela inteira nem
  // perder as paginas que o usuario ja abriu com "Carregar mais".
  async function refreshTop() {
    const version = requestVersion.current;
    try {
      const result = await apiRequest<Page<Incident>>(`/incidents?${buildParams().toString()}`);
      if (version !== requestVersion.current) return;
      setError(null);
      setTotal(result.total);
      setItems((prev) => {
        const freshIds = new Set(result.items.map((i) => i.id));
        const rest = prev.filter((i) => !freshIds.has(i.id));
        return [...result.items, ...rest];
      });
    } catch {
      if (version !== requestVersion.current) return;
      setError("Não foi possível atualizar os dados agora.");
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    try {
      const result = await apiRequest<Page<Incident>>(`/incidents?${buildParams(nextCursor).toString()}`);
      if (version !== requestVersion.current) return;
      setError(null);
      setItems((prev) => [...prev, ...result.items]);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch {
      if (version !== requestVersion.current) return;
      setError("Não foi possível carregar mais ocorrências.");
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadSummary();
    resetAndLoad();

    const interval = setInterval(() => { loadSummary(); refreshTop(); }, POLL_INTERVAL_MS);
    const socket = getSocket();
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);
    const onIncidentEvent = () => { loadSummary(); refreshTop(); };
    if (socket) {
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("incident:created", onIncidentEvent);
      socket.on("incident:updated", onIncidentEvent);
      if (socket.connected) setLive(true);
    }

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("incident:created", onIncidentEvent);
        socket.off("incident:updated", onIncidentEvent);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, showHistory, search]);

  function loadSummary() {
    apiRequest<IncidentSummary>("/incidents/summary").then(setSummary).catch(() => {});
  }

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

      {!summary ? (
        <SkeletonStatCards />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            label="Ocorrências abertas"
            value={summary.open}
            tone="red"
            active={filter === "open"}
            onClick={() => toggleFilter("open")}
          />
          <SummaryCard
            label="Equipe a caminho"
            value={summary.enRoute}
            tone="orange"
            active={filter === "enRoute"}
            onClick={() => toggleFilter("enRoute")}
          />
          <SummaryCard
            label="Em atendimento"
            value={summary.inService}
            tone="yellow"
            active={filter === "inService"}
            onClick={() => toggleFilter("inService")}
          />
          <SummaryCard
            label="Reencontros hoje"
            value={summary.resolvedToday}
            tone="green"
            active={filter === "resolvedToday"}
            onClick={() => toggleFilter("resolvedToday")}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="incidentSearch" className="sr-only">Buscar por número da pulseira</label>
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ocean-400" aria-hidden="true" />
          <input
            id="incidentSearch"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por número da pulseira"
            className="w-full rounded-lg border border-ocean-200 py-2 pl-9 pr-8 text-sm"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ocean-400 hover:text-ocean-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 text-sm font-medium text-red-600">
          <span>{error}</span>
          <button type="button" onClick={resetAndLoad} className="underline">Tentar novamente</button>
        </div>
      )}

      {filter && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ocean-700">
          <span>
            Filtrando por: <strong>{FILTER_LABEL[filter]}</strong> ({total})
          </span>
          <button onClick={() => setFilter(null)} className="font-medium text-ocean-600 underline">
            Limpar filtro
          </button>
        </div>
      )}

      {!filter && !search && summary && summary.oldFinalized > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowHistory((current) => !current)}
            className="text-sm font-medium text-ocean-600 underline"
          >
            {showHistory
              ? "Ocultar ocorrências de dias anteriores"
              : `Ver histórico completo (+${summary.oldFinalized} de dias anteriores)`}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {loading && <SkeletonRows count={3} />}
        {!loading && items.length === 0 && (
          <p className="rounded-lg border border-dashed border-ocean-200 bg-white p-6 text-center text-ocean-500">
            {search
              ? `Nenhuma ocorrência encontrada para "${search}".`
              : filter
              ? "Nenhuma ocorrência nesse status no momento."
              : "Nenhuma ocorrência registrada ainda."}
          </p>
        )}
        {items.map((incident) => (
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

      {!loading && items.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p role="status" aria-live="polite" className="text-sm text-ocean-500">
            {items.length} de {total} ocorrência(s)
          </p>
          {nextCursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-lg border border-ocean-200 px-4 py-2 text-sm font-semibold text-ocean-700 hover:bg-ocean-50 disabled:opacity-60"
            >
              {loadingMore && <Spinner className="h-4 w-4" />}
              {loadingMore ? "Carregando..." : "Carregar mais"}
            </button>
          )}
        </div>
      )}
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
