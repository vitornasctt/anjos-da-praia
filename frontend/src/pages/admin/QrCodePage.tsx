import { FormEvent, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";

const PUBLIC_BASE_URL = `${window.location.origin}/encontrei`;
const MAX_BATCH_SIZE = 9999;

function buildEncontreiUrl(printedNumber: string): string {
  const url = new URL(PUBLIC_BASE_URL);
  url.searchParams.set("numero", printedNumber);
  return url.toString();
}

function parseRange(start: string, end: string): string[] | null {
  const startNum = Number(start);
  const endNum = Number(end);
  if (!Number.isInteger(startNum) || !Number.isInteger(endNum) || startNum < 0 || endNum < startNum) return null;
  if (endNum - startNum + 1 > MAX_BATCH_SIZE) return null;
  const width = start.trim().length;
  const numbers: string[] = [];
  for (let n = startNum; n <= endNum; n++) {
    numbers.push(String(n).padStart(width, "0"));
  }
  return numbers;
}

function parseManualList(raw: string): string[] {
  const numbers = raw
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  return Array.from(new Set(numbers)).slice(0, MAX_BATCH_SIZE);
}

// Cada pulseira tem um QR Code proprio, com o numero impresso ja
// preenchido no link (?numero=), levando direto para a etapa de
// localizacao no /encontrei - sem precisar digitar nem cadastrar a
// pulseira antes de imprimir o QR.
export function QrCodePage() {
  const [batchMode, setBatchMode] = useState<"range" | "list">("range");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [manualList, setManualList] = useState("");
  const [batchNumbers, setBatchNumbers] = useState<string[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  function handleGenerateBatch(e: FormEvent) {
    e.preventDefault();
    setBatchError(null);
    setBatchNumbers([]);

    if (batchMode === "range") {
      const numbers = parseRange(rangeStart, rangeEnd);
      if (!numbers) {
        setBatchError(`Intervalo inválido. Use números inteiros, do menor para o maior (máx. ${MAX_BATCH_SIZE} por lote).`);
        return;
      }
      setBatchNumbers(numbers);
    } else {
      const numbers = parseManualList(manualList);
      if (numbers.length === 0) {
        setBatchError("Informe ao menos um número de pulseira.");
        return;
      }
      setBatchNumbers(numbers);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="no-print flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <QrCode className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        QR Code das pulseiras
      </h1>

      <div className="no-print rounded-xl border border-ocean-100 bg-white p-6 text-center shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">QR Code genérico</h2>
        <p className="mb-4 text-sm text-ocean-600">
          Alternativa sem número pré-preenchido: a pessoa é levada à página pública e informa
          manualmente o número impresso na pulseira.
        </p>
        <div className="flex justify-center">
          <QRCodeSVG value={PUBLIC_BASE_URL} size={180} />
        </div>
        <p className="mt-3 break-all text-xs text-ocean-500">{PUBLIC_BASE_URL}</p>
      </div>

      <div className="no-print rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Impressão em lote</h2>
        <p className="mb-4 text-sm text-ocean-600">
          Gere um ou vários QR Codes de uma vez para imprimir antes do evento — não é preciso
          cadastrar a pulseira antes, o número só precisa estar impresso na pulseira física.
        </p>

        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setBatchMode("range")}
            aria-pressed={batchMode === "range"}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              batchMode === "range" ? "bg-ocean-600 text-white" : "bg-ocean-50 text-ocean-700"
            }`}
          >
            Intervalo numérico
          </button>
          <button
            type="button"
            onClick={() => setBatchMode("list")}
            aria-pressed={batchMode === "list"}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              batchMode === "list" ? "bg-ocean-600 text-white" : "bg-ocean-50 text-ocean-700"
            }`}
          >
            Lista manual
          </button>
        </div>

        <form onSubmit={handleGenerateBatch} className="space-y-3">
          {batchMode === "range" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-ocean-700">
                De
                <input
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  placeholder="0001"
                  className="mt-1 block w-28 rounded-lg border border-ocean-200 px-3 py-2"
                />
              </label>
              <label className="text-sm text-ocean-700">
                Até
                <input
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  placeholder="9999"
                  className="mt-1 block w-28 rounded-lg border border-ocean-200 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700"
              >
                Gerar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={manualList}
                onChange={(e) => setManualList(e.target.value)}
                placeholder={"Um número por linha, ou separados por vírgula\nEx: 4821, 4822, 4823"}
                rows={4}
                className="w-full rounded-lg border border-ocean-200 px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700"
              >
                Gerar
              </button>
            </div>
          )}
        </form>

        {batchError && <p role="alert" className="mt-3 text-sm text-red-600">{batchError}</p>}

        {batchNumbers.length > 0 && (
          <div role="status" aria-live="polite" className="mt-4 flex items-center justify-between rounded-lg bg-ocean-50 px-4 py-3 text-sm text-ocean-700">
            <span>{batchNumbers.length} QR Code(s) gerado(s).</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700"
            >
              Imprimir
            </button>
          </div>
        )}
      </div>

      {batchNumbers.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4">
          {batchNumbers.map((number) => (
            <div
              key={number}
              className="flex flex-col items-center gap-2 rounded-lg border border-ocean-100 p-3 text-center break-inside-avoid"
            >
              <QRCodeSVG value={buildEncontreiUrl(number)} size={120} />
              <span className="font-mono text-sm font-bold text-ocean-900">#{number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
