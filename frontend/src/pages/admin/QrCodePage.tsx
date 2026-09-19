import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, QrCode } from "lucide-react";

// Um unico QR Code para tudo: o mesmo vai nos cartazes, nas tendas e nas
// pulseiras. Ele so leva a pagina publica; quem achou a crianca digita o
// numero impresso na pulseira. Por isso nunca precisa ser gerado de novo.
const PUBLIC_URL = `${window.location.origin}/encontrei`;
const LABELS_PER_SHEET = 24; // folha A4: 3 colunas x 8 linhas

type Sheet = "cartaz" | "etiquetas";

export function QrCodePage() {
  const [sheet, setSheet] = useState<Sheet>("cartaz");

  return (
    <div className="space-y-6">
      <h1 className="no-print flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <QrCode className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        QR Code para imprimir
      </h1>

      <div className="no-print rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <p className="text-ocean-800">
          Existe <strong>um único QR Code</strong>, igual para todas as pulseiras. Imprima uma vez
          e use em cartazes, tendas e nas pulseiras: quem achar a criança escaneia e digita o
          número que está na pulseira.
        </p>
        <p className="mt-3 text-sm text-ocean-600">
          Antes de imprimir, confira se este é o endereço oficial do site:{" "}
          <strong className="break-all text-ocean-900">{PUBLIC_URL}</strong>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSheet("cartaz")}
            aria-pressed={sheet === "cartaz"}
            className={`rounded-xl px-5 py-3 text-base font-semibold ${
              sheet === "cartaz" ? "bg-ocean-600 text-white" : "bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
            }`}
          >
            Cartaz (uma página)
          </button>
          <button
            type="button"
            onClick={() => setSheet("etiquetas")}
            aria-pressed={sheet === "etiquetas"}
            className={`rounded-xl px-5 py-3 text-base font-semibold ${
              sheet === "etiquetas" ? "bg-ocean-600 text-white" : "bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
            }`}
          >
            Etiquetas para pulseira ({LABELS_PER_SHEET} por folha)
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-red-700"
        >
          <Printer className="h-5 w-5" aria-hidden="true" />
          {sheet === "cartaz" ? "Imprimir cartaz" : "Imprimir folha de etiquetas"}
        </button>
      </div>

      {sheet === "cartaz" ? <Poster /> : <LabelSheet />}
    </div>
  );
}

// Cartaz A4: leitura de longe, letras grandes, tres passos.
function Poster() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 rounded-2xl border-4 border-ocean-600 bg-white p-8 text-center break-inside-avoid">
      <div>
        <h2 className="text-4xl font-extrabold text-ocean-900">Achou uma criança perdida?</h2>
        <p className="mt-1 text-base text-ocean-600">Found a lost child? · ¿Encontró a un niño perdido?</p>
      </div>

      <QRCodeSVG value={PUBLIC_URL} size={280} level="Q" />

      <ol className="w-full space-y-3 text-left text-2xl font-bold text-ocean-900">
        <li className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean-600 text-white">1</span>
          Aponte a câmera do celular para o QR Code
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean-600 text-white">2</span>
          Digite o número que está na pulseira da criança
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean-600 text-white">3</span>
          Toque em ENVIAR ALERTA e fique com a criança
        </li>
      </ol>

      <p className="text-sm text-ocean-600">Anjos da Praia · nossa equipe vai até você</p>
    </div>
  );
}

// Folha de etiquetas adesivas, todas iguais, para colar nas pulseiras.
function LabelSheet() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
      {Array.from({ length: LABELS_PER_SHEET }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg border border-ocean-200 bg-white p-2 break-inside-avoid"
        >
          <QRCodeSVG value={PUBLIC_URL} size={84} level="Q" />
          <p className="text-xs font-bold leading-tight text-ocean-900">
            Achou uma criança?
            <span className="mt-1 block font-medium text-ocean-700">
              Escaneie e digite o número da pulseira.
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}
