import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Overview {
  families: number;
  children: number;
  totalIncidents: number;
  reunited: number;
  avgResolutionMinutes: number | null;
  incidentsByBeach: { beach: string; count: number }[];
  incidentsByTent: { tent: string; count: number }[];
  incidentsByHour: { hour: number; count: number }[];
}

export function ReportsPage() {
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [retentionDays, setRetentionDays] = useState("90");
  const [retentionResult, setRetentionResult] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmRetention, setConfirmRetention] = useState(false);

  function load() {
    setLoadError(false);
    apiRequest<Overview>("/reports/overview").then(setData).catch(() => setLoadError(true));
  }

  useEffect(load, []);

  async function runRetention() {
    setRunning(true);
    setRetentionError(null);
    setRetentionResult(null);
    try {
      const result = await apiRequest<{ anonymizedFamilies: number; anonymizedChildren: number }>(
        "/reports/data-retention/run",
        { method: "POST", body: { days: Number(retentionDays) } }
      );
      setRetentionResult(
        `${result.anonymizedFamilies} família(s) e ${result.anonymizedChildren} criança(s) anonimizadas.`
      );
    } catch (err) {
      setRetentionError(err instanceof ApiError ? err.message : "Não foi possível executar a rotina.");
    } finally {
      setRunning(false);
      setConfirmRetention(false);
    }
  }

  if (loadError) return <div role="alert"><p className="text-red-600">Não foi possível carregar os relatórios.</p><button className="mt-2 underline" onClick={load}>Tentar novamente</button></div>;
  if (!data) return <p className="text-ocean-500">Carregando relatórios...</p>;

  const maxHourCount = Math.max(1, ...data.incidentsByHour.map((h) => h.count));

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <BarChart3 className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        Relatórios
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Famílias cadastradas" value={data.families} />
        <Stat label="Crianças cadastradas" value={data.children} />
        <Stat label="Ocorrências totais" value={data.totalIncidents} />
        <Stat label="Reencontros realizados" value={data.reunited} />
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-bold text-ocean-900">Tempo médio de atendimento</h2>
        <p className="text-3xl font-bold text-ocean-700">
          {data.avgResolutionMinutes !== null ? `${data.avgResolutionMinutes} min` : "Sem dados ainda"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-ocean-900">Ocorrências por praia</h2>
          <ul className="space-y-1 text-sm">
            {data.incidentsByBeach.map((row) => (
              <li key={row.beach} className="flex justify-between border-b border-ocean-50 py-1">
                <span>{row.beach}</span>
                <span className="font-semibold">{row.count}</span>
              </li>
            ))}
            {data.incidentsByBeach.length === 0 && <p className="text-ocean-500">Sem dados ainda.</p>}
          </ul>
        </div>

        <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-bold text-ocean-900">Ocorrências por tenda mais próxima</h2>
          <ul className="space-y-1 text-sm">
            {data.incidentsByTent.map((row) => (
              <li key={row.tent} className="flex justify-between border-b border-ocean-50 py-1">
                <span>{row.tent}</span>
                <span className="font-semibold">{row.count}</span>
              </li>
            ))}
            {data.incidentsByTent.length === 0 && (
              <p className="text-ocean-500">Sem ocorrências com localização registrada ainda.</p>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Horários com mais ocorrências</h2>
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {data.incidentsByHour.map((row) => (
            <div key={row.hour} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                role="img"
                aria-label={`${row.count} ocorrência(s) às ${row.hour}h`}
                className="w-full rounded-t bg-ocean-500"
                style={{ height: Math.max(4, (row.count / maxHourCount) * 100) }}
                title={`${row.count} ocorrência(s) às ${row.hour}h`}
              />
              <span className="text-[10px] text-ocean-500" aria-hidden="true">{row.hour}h</span>
            </div>
          ))}
          {data.incidentsByHour.length === 0 && <p className="text-ocean-500">Sem dados ainda.</p>}
        </div>
        <table className="sr-only">
          <caption>Ocorrências por horário do dia</caption>
          <thead>
            <tr>
              <th scope="col">Horário</th>
              <th scope="col">Ocorrências</th>
            </tr>
          </thead>
          <tbody>
            {data.incidentsByHour.map((row) => (
              <tr key={row.hour}>
                <td>{row.hour}h</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-bold text-ocean-900">Retenção e expurgo de dados (LGPD)</h2>
        <p className="mb-3 text-sm text-ocean-600">
          Anonimiza cadastros antigos somente quando toda a família está sem atendimentos abertos ou recentes.
          Inclui cadastros sem ocorrências e encerra suas pulseiras. Roda às 03h no horário de Brasília.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="retentionDays" className="text-sm font-semibold text-ocean-900">
            Dias de retenção
          </label>
          <input
            id="retentionDays"
            type="number"
            min={1}
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
            className="w-24 rounded-lg border border-ocean-200 px-3 py-2"
          />
          <button
            onClick={() => setConfirmRetention(true)}
            disabled={running}
            title={`Anonimiza agora os cadastros elegíveis com mais de ${retentionDays} dia(s) sem atendimento em aberto`}
            className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700 disabled:opacity-60"
          >
            {running ? "Executando..." : "Executar agora"}
          </button>
        </div>
        {retentionResult && <p role="status" className="mt-2 text-sm font-medium text-green-700">{retentionResult}</p>}
        {retentionError && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{retentionError}</p>}
      </div>

      <ConfirmDialog
        open={confirmRetention}
        title="Executar retenção de dados agora"
        description={`Isso vai apagar nome, telefone e foto de todos os cadastros elegíveis com mais de ${retentionDays} dia(s) sem atendimento em aberto, imediatamente. Não pode ser desfeito.`}
        confirmLabel="Executar e anonimizar"
        busy={running}
        onConfirm={runRetention}
        onCancel={() => setConfirmRetention(false)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm">
      <div className="text-3xl font-bold text-ocean-800">{value}</div>
      <div className="text-sm text-ocean-500">{label}</div>
    </div>
  );
}
