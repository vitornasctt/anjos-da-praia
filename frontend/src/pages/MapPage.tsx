import { getSocket } from "../services/socket";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon } from "lucide-react";
import { apiRequest } from "../services/api";
import { Incident, Tent } from "../types";
import { STATUS_META } from "../components/StatusBadge";

// Mapa exclusivo para usuarios autorizados (item 12). Nunca exposto
// publicamente - a localizacao da crianca so aparece aqui.
// Centro padrao: Faculdade Pitagoras, Guarapari/ES (sede da operacao).
const DEFAULT_CENTER: [number, number] = [-20.6568561, -40.5039761];

function statusIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></div>`,
    iconSize: [18, 18],
  });
}

// Mesmo estilo de tracejado do lucide-react (Tent), mas como HTML cru:
// o Leaflet renderiza divIcon fora da arvore do React, entao nao da pra
// usar o componente diretamente aqui.
const tentIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#134e6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.35))"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`,
  iconSize: [22, 22],
});

const COLOR_MAP: Record<string, string> = {
  CRIANCA_LOCALIZADA: "#dc2626",
  EQUIPE_A_CAMINHO: "#ea580c",
  CRIANCA_RECEBIDA_PELA_EQUIPE: "#ca8a04",
  RESPONSAVEIS_LOCALIZADOS: "#1f7fa8",
};

export function MapPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tents, setTents] = useState<Tent[]>([]);

  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const [items, support] = await Promise.all([apiRequest<Incident[]>("/incidents"), apiRequest<Tent[]>("/tents")]);
        if (!cancelled) { setIncidents(items); setTents(support.filter((tent) => tent.active)); setError(null); }
      } catch { if (!cancelled) setError("Não foi possível atualizar o mapa. Tentaremos novamente em instantes."); }
      finally { loading = false; }
    }
    load();
    const timer = setInterval(load, 20000);
    const socket = getSocket();
    socket?.on("incident:created", load);
    socket?.on("incident:updated", load);
    return () => { cancelled = true; clearInterval(timer); socket?.off("incident:created", load); socket?.off("incident:updated", load); };
  }, []);

  const openIncidents = incidents.filter(
    (i) => i.status !== "REENCONTRO_REALIZADO" && i.status !== "CANCELADA" && i.latitude != null && i.longitude != null
  );

  // Centraliza na primeira tenda ativa cadastrada; sem tendas, usa o
  // padrao (sede da operacao) em vez de um ponto fixo que pode nao
  // corresponder a cidade onde o sistema esta sendo usado.
  const center: [number, number] =
    tents.length > 0 ? [tents[0].latitude, tents[0].longitude] : DEFAULT_CENTER;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <MapIcon className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        Mapa de ocorrências
      </h1>
      <p className="text-sm text-ocean-600">
        Mapa interativo com a localização das ocorrências abertas. Para uma versão em texto com os
        mesmos dados, consulte o <a href="/painel" className="underline">Painel</a>.
      </p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div
        role="application"
        aria-label={`Mapa com ${openIncidents.length} ocorrência(s) aberta(s) e ${tents.length} tenda(s) ativa(s)`}
        className="h-[70vh] overflow-hidden rounded-xl border border-ocean-100 shadow-sm"
      >
        <MapContainer key={center.join(",")} center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {openIncidents.map((incident) => (
            <Marker
              key={incident.id}
              position={[incident.latitude!, incident.longitude!]}
              icon={statusIcon(COLOR_MAP[incident.status] ?? "#666")}
              title={`Pulseira #${incident.wristband?.printedNumber} — ${STATUS_META[incident.status].label}`}
              alt={`Pulseira #${incident.wristband?.printedNumber} — ${STATUS_META[incident.status].label}`}
            >
              <Popup>
                <strong>Pulseira #{incident.wristband?.printedNumber}</strong>
                <br />
                {STATUS_META[incident.status].label}
                <br />
                {new Date(incident.createdAt).toLocaleTimeString("pt-BR")}
              </Popup>
            </Marker>
          ))}
          {tents.map((tent) => (
            <Marker
              key={tent.id}
              position={[tent.latitude, tent.longitude]}
              icon={tentIcon}
              title={`Tenda de apoio: ${tent.name}${tent.beach?.name ? ` — ${tent.beach.name}` : ""}`}
              alt={`Tenda de apoio: ${tent.name}${tent.beach?.name ? ` — ${tent.beach.name}` : ""}`}
            >
              <Popup>
                <strong>{tent.name}</strong>
                <br />
                {tent.beach?.name}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
