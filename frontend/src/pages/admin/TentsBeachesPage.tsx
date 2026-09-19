import { FormEvent, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Tent as TentIcon, Search, X } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SkeletonRows } from "../../components/Skeleton";
import { Beach, Tent, Team } from "../../types";

type DeleteTarget = { kind: "beach"; item: Beach } | { kind: "tent"; item: Tent };

// Mesmo centro padrao do Mapa (sede da operacao em Guarapari/ES) - so o
// ponto inicial de exibicao, o clique no mapa funciona em qualquer lugar.
const DEFAULT_CENTER: [number, number] = [-20.6568561, -40.5039761];

// Pin vermelho estilo Google Maps. O icone padrao do Leaflet depende de
// imagens que o bundler nao resolve (aparece quebrado), entao desenhamos
// o pin em SVG, ancorado pela ponta para marcar o ponto exato do clique.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 24 32" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#ea4335" stroke="#b31412" stroke-width="1"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

// Componente sem render proprio: so escuta cliques no mapa (padrao do
// react-leaflet para eventos) e repassa a coordenada pro formulario.
function LocationPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function TentsBeachesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [tents, setTents] = useState<Tent[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingBeach, setSavingBeach] = useState(false);
  const [savingTent, setSavingTent] = useState(false);
  // ids em transicao otimista (toggle ativo/inativo) - permite reverter
  // a troca local se o PATCH falhar, sem esperar o servidor pra refletir
  // uma mudanca de estado trivialmente reversivel.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const [beachForm, setBeachForm] = useState({ name: "", city: "" });
  const [tentForm, setTentForm] = useState({ beachId: "", name: "", latitude: "", longitude: "" });
  // Lista de referencia (teto de seguranca no backend, ver tents.routes.ts) -
  // filtro so no cliente, sem round trip extra, pois o conjunto ja esta
  // inteiro em memoria e um cadastro cresce por temporadas, nao por milhares.
  const [tentFilter, setTentFilter] = useState("");
  const filteredTents = useMemo(() => {
    const term = tentFilter.trim().toLowerCase();
    if (!term) return tents;
    return tents.filter((t) => t.name.toLowerCase().includes(term) || t.beach?.name.toLowerCase().includes(term));
  }, [tents, tentFilter]);

  async function loadAll() {
    const [beachesResult, tentsResult, teamsResult] = await Promise.allSettled([
      apiRequest<Beach[]>("/beaches"),
      apiRequest<Tent[]>("/tents"),
      apiRequest<Team[]>("/teams?includeInactive=true"),
    ]);
    if (beachesResult.status === "fulfilled") setBeaches(beachesResult.value);
    else setError("Não foi possível carregar as praias.");
    if (tentsResult.status === "fulfilled") setTents(tentsResult.value);
    else setError("Não foi possível carregar as tendas.");
    if (teamsResult.status === "fulfilled") setTeams(teamsResult.value);
    else setError("Não foi possível carregar as equipes.");
    setLoadingLists(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleBeachSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingBeach(true);
    try {
      await apiRequest("/beaches", { method: "POST", body: beachForm });
      setBeachForm({ name: "", city: "" });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a praia.");
    } finally {
      setSavingBeach(false);
    }
  }

  async function handleTentSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingTent(true);
    try {
      await apiRequest("/tents", {
        method: "POST",
        body: {
          beachId: tentForm.beachId,
          name: tentForm.name,
          latitude: Number(tentForm.latitude),
          longitude: Number(tentForm.longitude),
        },
      });
      setTentForm({ beachId: "", name: "", latitude: "", longitude: "" });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a tenda.");
    } finally {
      setSavingTent(false);
    }
  }

  async function handleTeamSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSavingTeam(true);
    try { await apiRequest("/teams", { method: "POST", body: { name: teamName } }); setTeamName(""); await loadAll(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a equipe."); }
    finally { setSavingTeam(false); }
  }

  // Optimistic: o toggle ativo/inativo e trivialmente reversivel (basta
  // reexibir o valor anterior), entao a UI muda na hora e so reverte se o
  // PATCH falhar de verdade - sem esperar round-trip pra um clique simples.
  async function toggleActive(kind: "teams" | "tents", item: Team | Tent) {
    setError(null);
    setTogglingIds((prev) => new Set(prev).add(item.id));
    const nextActive = !item.active;
    if (kind === "teams") setTeams((prev) => prev.map((t) => (t.id === item.id ? { ...t, active: nextActive } : t)));
    else setTents((prev) => prev.map((t) => (t.id === item.id ? { ...t, active: nextActive } : t)));
    try {
      await apiRequest(`/${kind}/${item.id}`, { method: "PATCH", body: { active: nextActive } });
    } catch (err) {
      // rollback: volta pro estado anterior porque o servidor nao confirmou
      if (kind === "teams") setTeams((prev) => prev.map((t) => (t.id === item.id ? { ...t, active: item.active } : t)));
      else setTents((prev) => prev.map((t) => (t.id === item.id ? { ...t, active: item.active } : t)));
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/${deleteTarget.kind === "beach" ? "beaches" : "tents"}/${deleteTarget.item.id}`, { method: "DELETE" });
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Não foi possível excluir a ${deleteTarget.kind === "beach" ? "praia" : "tenda"}.`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <TentIcon className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        Tendas e praias
      </h1>
      {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}

      <section className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Equipes</h2>
        <form onSubmit={handleTeamSubmit} className="flex flex-wrap gap-2">
          <label htmlFor="teamName" className="sr-only">Nome da equipe</label>
          <input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={80} placeholder="Nome da equipe" className="rounded-lg border border-ocean-200 px-3 py-2" />
          <button disabled={savingTeam} className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{savingTeam ? "Salvando..." : "Cadastrar equipe"}</button>
        </form>
        {loadingLists ? (
          <SkeletonRows count={2} className="mt-4" />
        ) : (
          <ul className="mt-4 divide-y divide-ocean-50 text-sm">
            {teams.map((team) => (
              <li key={team.id} className="flex justify-between gap-3 py-2">
                <span>{team.name} {team.active ? "" : "(inativa)"}</span>
                <button
                  onClick={() => toggleActive("teams", team)}
                  disabled={togglingIds.has(team.id)}
                  aria-label={`${team.active ? "Desativar" : "Ativar"} equipe ${team.name}`}
                  className="text-ocean-600 underline disabled:opacity-50"
                >
                  {team.active ? "Desativar" : "Ativar"}
                </button>
              </li>
            ))}
            {teams.length === 0 && <p className="py-2 text-ocean-500">Nenhuma equipe cadastrada ainda.</p>}
          </ul>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-lg font-bold text-ocean-900">Nova praia</h2>
          <form onSubmit={handleBeachSubmit} className="space-y-3">
            <label htmlFor="beachName" className="sr-only">Nome da praia</label>
            <input
              id="beachName"
              value={beachForm.name}
              onChange={(e) => setBeachForm({ ...beachForm, name: e.target.value })}
              placeholder="Nome da praia"
              required
              className="w-full rounded-lg border border-ocean-200 px-3 py-2"
            />
            <label htmlFor="beachCity" className="sr-only">Cidade</label>
            <input
              id="beachCity"
              value={beachForm.city}
              onChange={(e) => setBeachForm({ ...beachForm, city: e.target.value })}
              placeholder="Cidade"
              required
              className="w-full rounded-lg border border-ocean-200 px-3 py-2"
            />
            <button type="submit" disabled={savingBeach} className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700 disabled:opacity-60">
              {savingBeach ? "Salvando..." : "Cadastrar praia"}
            </button>
          </form>
          {loadingLists ? (
            <SkeletonRows count={2} className="mt-4" />
          ) : (
            <ul className="mt-4 divide-y divide-ocean-50 text-sm">
              {beaches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{b.name} — {b.city}</span>
                  <button
                    onClick={() => setDeleteTarget({ kind: "beach", item: b })}
                    aria-label={`Excluir praia ${b.name}`}
                    className="text-red-600 underline"
                  >
                    Excluir
                  </button>
                </li>
              ))}
              {beaches.length === 0 && <p className="py-2 text-ocean-500">Nenhuma praia cadastrada ainda.</p>}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-lg font-bold text-ocean-900">Nova tenda</h2>
          <form onSubmit={handleTentSubmit} className="space-y-3">
            <label htmlFor="tentBeach" className="sr-only">Praia da tenda</label>
            <select
              id="tentBeach"
              value={tentForm.beachId}
              onChange={(e) => setTentForm({ ...tentForm, beachId: e.target.value })}
              required
              className="w-full rounded-lg border border-ocean-200 px-3 py-2"
            >
              <option value="">Selecione a praia...</option>
              {beaches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <label htmlFor="tentName" className="sr-only">Nome ou código da tenda</label>
            <input
              id="tentName"
              value={tentForm.name}
              onChange={(e) => setTentForm({ ...tentForm, name: e.target.value })}
              placeholder="Nome/código da tenda"
              required
              className="w-full rounded-lg border border-ocean-200 px-3 py-2"
            />
            <div>
              <p className="mb-1 text-sm text-ocean-600">Clique no mapa para marcar o local da tenda</p>
              <div className="h-56 overflow-hidden rounded-lg border border-ocean-200">
                <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationPicker
                    onPick={(lat, lng) => setTentForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))}
                  />
                  {tentForm.latitude && tentForm.longitude && !Number.isNaN(Number(tentForm.latitude)) && !Number.isNaN(Number(tentForm.longitude)) && (
                    <Marker position={[Number(tentForm.latitude), Number(tentForm.longitude)]} icon={pinIcon} />
                  )}
                </MapContainer>
              </div>
            </div>
            <div className="flex gap-2">
              <label htmlFor="tentLatitude" className="sr-only">Latitude</label>
              <input
                id="tentLatitude"
                value={tentForm.latitude}
                onChange={(e) => setTentForm({ ...tentForm, latitude: e.target.value })}
                placeholder="Latitude"
                required
                className="w-full rounded-lg border border-ocean-200 px-3 py-2"
              />
              <label htmlFor="tentLongitude" className="sr-only">Longitude</label>
              <input
                id="tentLongitude"
                value={tentForm.longitude}
                onChange={(e) => setTentForm({ ...tentForm, longitude: e.target.value })}
                placeholder="Longitude"
                required
                className="w-full rounded-lg border border-ocean-200 px-3 py-2"
              />
            </div>
            <button type="submit" disabled={savingTent} className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700 disabled:opacity-60">
              {savingTent ? "Salvando..." : "Cadastrar tenda"}
            </button>
          </form>
          {!loadingLists && tents.length > 0 && (
            <div className="mt-4">
              <label htmlFor="tentFilter" className="sr-only">Filtrar tendas por nome ou praia</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ocean-400" aria-hidden="true" />
                <input
                  id="tentFilter"
                  value={tentFilter}
                  onChange={(e) => setTentFilter(e.target.value)}
                  placeholder="Filtrar tendas por nome ou praia"
                  className="w-full rounded-lg border border-ocean-200 py-2 pl-9 pr-8 text-base sm:text-sm"
                />
                {tentFilter && (
                  <button
                    type="button"
                    onClick={() => setTentFilter("")}
                    aria-label="Limpar filtro"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ocean-400 hover:text-ocean-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
          {loadingLists && <SkeletonRows count={2} className="mt-4" />}
          <ul className="mt-4 divide-y divide-ocean-50 text-sm">
            {!loadingLists && filteredTents.map((t) => (
              <li key={t.id} className="py-2">
                {t.name} — {t.beach?.name} {t.active ? "" : "(inativa)"}{" "}
                <button
                  onClick={() => toggleActive("tents", t)}
                  disabled={togglingIds.has(t.id)}
                  aria-label={`${t.active ? "Desativar" : "Ativar"} tenda ${t.name}`}
                  className="ml-2 text-ocean-600 underline disabled:opacity-50"
                >
                  {t.active ? "Desativar" : "Ativar"}
                </button>{" "}
                <button
                  onClick={() => setDeleteTarget({ kind: "tent", item: t })}
                  aria-label={`Excluir tenda ${t.name}`}
                  className="ml-2 text-red-600 underline"
                >
                  Excluir
                </button>
              </li>
            ))}
            {!loadingLists && tents.length === 0 && <p className="py-2 text-ocean-500">Nenhuma tenda cadastrada ainda.</p>}
            {!loadingLists && tents.length > 0 && filteredTents.length === 0 && (
              <p role="status" className="py-2 text-ocean-500">Nenhuma tenda encontrada para "{tentFilter}".</p>
            )}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Excluir ${deleteTarget?.kind === "beach" ? "praia" : "tenda"}`}
        description={`Excluir ${deleteTarget?.kind === "beach" ? "a praia" : "a tenda"} "${deleteTarget?.item.name}"? Isso não pode ser desfeito.`}
        confirmLabel="Excluir"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
