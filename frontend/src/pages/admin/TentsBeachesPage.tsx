import { FormEvent, useEffect, useState } from "react";
import { Tent as TentIcon } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Beach, Tent, Team } from "../../types";

type DeleteTarget = { kind: "beach"; item: Beach } | { kind: "tent"; item: Tent };

export function TentsBeachesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [tents, setTents] = useState<Tent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [beachForm, setBeachForm] = useState({ name: "", city: "" });
  const [tentForm, setTentForm] = useState({ beachId: "", name: "", latitude: "", longitude: "" });

  function loadAll() {
    apiRequest<Beach[]>("/beaches").then(setBeaches).catch(() => setError("Não foi possível carregar as praias."));
    apiRequest<Tent[]>("/tents").then(setTents).catch(() => setError("Não foi possível carregar as tendas."));
    apiRequest<Team[]>("/teams?includeInactive=true").then(setTeams).catch(() => setError("Não foi possível carregar as equipes."));
  }

  useEffect(loadAll, []);

  async function handleBeachSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/beaches", { method: "POST", body: beachForm });
      setBeachForm({ name: "", city: "" });
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a praia.");
    }
  }

  async function handleTentSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a tenda.");
    }
  }

  async function handleTeamSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSavingTeam(true);
    try { await apiRequest("/teams", { method: "POST", body: { name: teamName } }); setTeamName(""); loadAll(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar a equipe."); }
    finally { setSavingTeam(false); }
  }
  async function toggleActive(kind: "teams" | "tents", item: Team | Tent) {
    setError(null);
    try { await apiRequest(`/${kind}/${item.id}`, { method: "PATCH", body: { active: !item.active } }); loadAll(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível atualizar."); }
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

      <section className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Equipes</h2>
        <form onSubmit={handleTeamSubmit} className="flex flex-wrap gap-2">
          <label htmlFor="teamName" className="sr-only">Nome da equipe</label>
          <input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={80} placeholder="Nome da equipe" className="rounded-lg border border-ocean-200 px-3 py-2" />
          <button disabled={savingTeam} className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{savingTeam ? "Salvando..." : "Cadastrar equipe"}</button>
        </form>
        <ul className="mt-4 divide-y divide-ocean-50 text-sm">{teams.map((team) => (
          <li key={team.id} className="flex justify-between gap-3 py-2">
            <span>{team.name} {team.active ? "" : "(inativa)"}</span>
            <button
              onClick={() => toggleActive("teams", team)}
              aria-label={`${team.active ? "Desativar" : "Ativar"} equipe ${team.name}`}
              className="text-ocean-600 underline"
            >
              {team.active ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}</ul>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
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
            <button type="submit" className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700">
              Cadastrar praia
            </button>
          </form>
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
          </ul>
        </div>

        <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
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
            <button type="submit" className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700">
              Cadastrar tenda
            </button>
          </form>
          <ul className="mt-4 divide-y divide-ocean-50 text-sm">
            {tents.map((t) => (
              <li key={t.id} className="py-2">
                {t.name} — {t.beach?.name} {t.active ? "" : "(inativa)"}{" "}
                <button
                  onClick={() => toggleActive("tents", t)}
                  aria-label={`${t.active ? "Desativar" : "Ativar"} tenda ${t.name}`}
                  className="ml-2 text-ocean-600 underline"
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
