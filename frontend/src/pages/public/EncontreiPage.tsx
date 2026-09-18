import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../../services/api";
import { STATUS_META } from "../../components/StatusBadge";
import { Beach, IncidentStatus } from "../../types";

type Step = "verificando_token" | "numero" | "localizacao" | "fallback" | "confirmado";
type Lang = "pt" | "en" | "es";

const STATUS_POLL_INTERVAL_MS = 15000;
const FINAL_STATUSES: IncidentStatus[] = ["REENCONTRO_REALIZADO", "CANCELADA"];
const LANG_STORAGE_KEY = "encontrei_lang";

interface StatusCopy {
  title: string;
  text: string;
}

interface PageCopy {
  headerTitle: string;
  loading: string;
  numeroPrompt: string;
  numeroLabel: string;
  numeroRequired: string;
  numeroNotFound: string;
  networkError: string;
  checking: string;
  continueBtn: string;
  locationPrompt: string;
  locating: string;
  sending: string;
  shareLocationBtn: string;
  cannotShare: string;
  fallbackPrompt: string;
  beachLabel: string;
  selectPlaceholder: string;
  referenceLabel: string;
  referencePlaceholder: string;
  fallbackRequired: string;
  retryLocation: string;
  sendAlertBtn: string;
  beachesLoadError: string;
  tapToRetry: string;
  submitError: string;
  statusConnError: string;
  autoUpdating: string;
  status: Record<IncidentStatus, StatusCopy>;
}

// Textos voltados a quem encontrou a crianca - nunca revelam dado
// pessoal, so o andamento do atendimento (item 7 do briefing). Praia
// turistica: o texto tambem existe em ingles e espanhol (item 5).
const COPY: Record<Lang, PageCopy> = {
  pt: {
    headerTitle: "Encontrei uma criança",
    loading: "Carregando...",
    numeroPrompt: "Informe o número da pulseira para avisar nossa equipe.",
    numeroLabel: "Número da pulseira",
    numeroRequired: "Informe o número da pulseira.",
    numeroNotFound: "Número não encontrado. Confira os dígitos na pulseira e tente novamente.",
    networkError: "Não foi possível conectar. Verifique sua internet e tente novamente.",
    checking: "Verificando...",
    continueBtn: "CONTINUAR",
    locationPrompt: "Compartilhe sua localização para nossa equipe chegar até você.",
    locating: "Obtendo localização...",
    sending: "Enviando...",
    shareLocationBtn: "COMPARTILHAR LOCALIZAÇÃO E ENVIAR ALERTA",
    cannotShare: "Não consigo compartilhar a localização",
    fallbackPrompt: "Não conseguimos acessar sua localização. Ajude nossa equipe de outra forma:",
    beachLabel: "Praia",
    selectPlaceholder: "Selecione...",
    referenceLabel: "Ponto de referência (opcional)",
    referencePlaceholder: "Ex: perto do Posto 3",
    fallbackRequired: "Selecione a praia ou informe um ponto de referência.",
    retryLocation: "Tentar localização novamente",
    sendAlertBtn: "ENVIAR ALERTA",
    beachesLoadError: "Não foi possível carregar as praias. Informe um ponto de referência ou tente novamente.",
    tapToRetry: "Toque em enviar novamente.",
    submitError: "Não foi possível enviar o alerta.",
    statusConnError: "Sem conexão para atualizar. Exibindo o último status recebido.",
    autoUpdating: "Atualizando automaticamente...",
    status: {
      CRIANCA_LOCALIZADA: {
        title: "Alerta enviado!",
        text: "Nossa equipe foi avisada. Permaneça em um local seguro e visível com a criança enquanto o atendimento é realizado.",
      },
      EQUIPE_A_CAMINHO: {
        title: "Equipe a caminho!",
        text: "Alguém da nossa equipe já está indo até você. Permaneça em um local seguro e visível com a criança.",
      },
      CRIANCA_RECEBIDA_PELA_EQUIPE: {
        title: "Equipe chegou!",
        text: "Nossa equipe está com a criança agora. Muito obrigado por ajudar!",
      },
      RESPONSAVEIS_LOCALIZADOS: {
        title: "Responsáveis localizados!",
        text: "Já encontramos a família. O reencontro está sendo preparado.",
      },
      REENCONTRO_REALIZADO: {
        title: "Reencontro realizado!",
        text: "A criança já está com a família. Muito obrigado por ajudar!",
      },
      CANCELADA: {
        title: "Atendimento encerrado",
        text: "Este atendimento foi encerrado pela nossa equipe. Obrigado por ajudar!",
      },
    },
  },
  en: {
    headerTitle: "I found a child",
    loading: "Loading...",
    numeroPrompt: "Enter the wristband number to alert our team.",
    numeroLabel: "Wristband number",
    numeroRequired: "Enter the wristband number.",
    numeroNotFound: "Number not found. Check the digits on the wristband and try again.",
    networkError: "Could not connect. Check your internet connection and try again.",
    checking: "Checking...",
    continueBtn: "CONTINUE",
    locationPrompt: "Share your location so our team can reach you.",
    locating: "Getting location...",
    sending: "Sending...",
    shareLocationBtn: "SHARE LOCATION AND SEND ALERT",
    cannotShare: "I can't share my location",
    fallbackPrompt: "We couldn't access your location. Help our team another way:",
    beachLabel: "Beach",
    selectPlaceholder: "Select...",
    referenceLabel: "Reference point (optional)",
    referencePlaceholder: "E.g.: near Lifeguard Post 3",
    fallbackRequired: "Select the beach or enter a reference point.",
    retryLocation: "Try location again",
    sendAlertBtn: "SEND ALERT",
    beachesLoadError: "Could not load beaches. Enter a reference point or try again.",
    tapToRetry: "Tap to send again.",
    submitError: "Could not send the alert.",
    statusConnError: "No connection to update. Showing the last status received.",
    autoUpdating: "Updating automatically...",
    status: {
      CRIANCA_LOCALIZADA: {
        title: "Alert sent!",
        text: "Our team has been notified. Stay in a safe, visible spot with the child while help is on the way.",
      },
      EQUIPE_A_CAMINHO: {
        title: "Team on the way!",
        text: "Someone from our team is heading to you now. Stay in a safe, visible spot with the child.",
      },
      CRIANCA_RECEBIDA_PELA_EQUIPE: {
        title: "Team has arrived!",
        text: "Our team is with the child now. Thank you so much for helping!",
      },
      RESPONSAVEIS_LOCALIZADOS: {
        title: "Family located!",
        text: "We've found the family. The reunion is being arranged.",
      },
      REENCONTRO_REALIZADO: {
        title: "Reunion complete!",
        text: "The child is back with their family. Thank you so much for helping!",
      },
      CANCELADA: {
        title: "Case closed",
        text: "This case was closed by our team. Thanks for helping!",
      },
    },
  },
  es: {
    headerTitle: "Encontré a un niño",
    loading: "Cargando...",
    numeroPrompt: "Ingresa el número de la pulsera para avisar a nuestro equipo.",
    numeroLabel: "Número de la pulsera",
    numeroRequired: "Ingresa el número de la pulsera.",
    numeroNotFound: "Número no encontrado. Revisa los dígitos de la pulsera e intenta de nuevo.",
    networkError: "No se pudo conectar. Verifica tu conexión a internet e intenta de nuevo.",
    checking: "Verificando...",
    continueBtn: "CONTINUAR",
    locationPrompt: "Comparte tu ubicación para que nuestro equipo llegue hasta ti.",
    locating: "Obteniendo ubicación...",
    sending: "Enviando...",
    shareLocationBtn: "COMPARTIR UBICACIÓN Y ENVIAR ALERTA",
    cannotShare: "No puedo compartir mi ubicación",
    fallbackPrompt: "No pudimos acceder a tu ubicación. Ayuda a nuestro equipo de otra forma:",
    beachLabel: "Playa",
    selectPlaceholder: "Selecciona...",
    referenceLabel: "Punto de referencia (opcional)",
    referencePlaceholder: "Ej.: cerca del Puesto 3",
    fallbackRequired: "Selecciona la playa o indica un punto de referencia.",
    retryLocation: "Intentar ubicación de nuevo",
    sendAlertBtn: "ENVIAR ALERTA",
    beachesLoadError: "No se pudieron cargar las playas. Indica un punto de referencia o intenta de nuevo.",
    tapToRetry: "Toca para enviar de nuevo.",
    submitError: "No se pudo enviar la alerta.",
    statusConnError: "Sin conexión para actualizar. Mostrando el último estado recibido.",
    autoUpdating: "Actualizando automáticamente...",
    status: {
      CRIANCA_LOCALIZADA: {
        title: "¡Alerta enviada!",
        text: "Nuestro equipo fue avisado. Permanece en un lugar seguro y visible con el niño mientras se realiza la atención.",
      },
      EQUIPE_A_CAMINHO: {
        title: "¡Equipo en camino!",
        text: "Alguien de nuestro equipo ya va hacia ti. Permanece en un lugar seguro y visible con el niño.",
      },
      CRIANCA_RECEBIDA_PELA_EQUIPE: {
        title: "¡Equipo llegó!",
        text: "Nuestro equipo está con el niño ahora. ¡Muchas gracias por ayudar!",
      },
      RESPONSAVEIS_LOCALIZADOS: {
        title: "¡Familia localizada!",
        text: "Ya encontramos a la familia. El reencuentro se está preparando.",
      },
      REENCONTRO_REALIZADO: {
        title: "¡Reencuentro realizado!",
        text: "El niño ya está con su familia. ¡Muchas gracias por ayudar!",
      },
      CANCELADA: {
        title: "Atención finalizada",
        text: "Esta atención fue cerrada por nuestro equipo. ¡Gracias por ayudar!",
      },
    },
  },
};

function detectDefaultLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "pt" || saved === "en" || saved === "es") return saved;
  } catch {
    // localStorage indisponivel (modo privado etc.) - segue com o idioma do navegador.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : "pt";
  if (nav === "en") return "en";
  if (nav === "es") return "es";
  return "pt";
}

// Fluxo publico acessado pelo QR Code da pulseira. Prioridade absoluta:
// o menor numero de decisoes possivel ate o alerta ser enviado (item 3 e 7
// do briefing). Nada de menus, popups ou mensagens institucionais aqui.
export function EncontreiPage() {
  const [params] = useSearchParams();
  // QR Code individual (opcional): o link pode trazer um token publico
  // opaco (?pulseira=<publicIdentifier>) que nunca revela o ID interno.
  // Quando presente, pulamos direto para a etapa de localizacao.
  const wristbandToken = params.get("pulseira");
  // QR Code individual por numero impresso (?numero=<printedNumber>): usado
  // pela impressao em lote no painel, que gera o link antes mesmo da
  // pulseira existir no banco - por isso valida a existencia aqui, nao no
  // momento da geracao do QR.
  const printedNumberParam = params.get("numero");
  const [lang, setLang] = useState<Lang>(detectDefaultLang);
  const t = COPY[lang];
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const locationInFlight = useRef(false);
  const [locating, setLocating] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [step, setStep] = useState<Step>(wristbandToken || printedNumberParam ? "verificando_token" : "numero");
  const [printedNumber, setPrintedNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<IncidentStatus>("CRIANCA_LOCALIZADA");

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [loadingBeaches, setLoadingBeaches] = useState(false);
  const [selectedBeachId, setSelectedBeachId] = useState("");
  const [referencePoint, setReferencePoint] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // localStorage indisponivel - preferencia de idioma so vale para esta sessao.
    }
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    setValidatedToken(null);

    if (wristbandToken) {
      setStep("verificando_token");
      apiRequest<{ exists: boolean }>(
        `/public/wristbands/by-token/${encodeURIComponent(wristbandToken)}/check`
      ).then((result) => {
        if (cancelled) return;
        setValidatedToken(result.exists ? wristbandToken : null);
        setStep(result.exists ? "localizacao" : "numero");
      }).catch(() => { if (!cancelled) setStep("numero"); });
      return () => { cancelled = true; };
    }

    if (printedNumberParam) {
      setPrintedNumber(printedNumberParam);
      setStep("verificando_token");
      apiRequest<{ exists: boolean }>(
        `/public/wristbands/${encodeURIComponent(printedNumberParam.trim())}/check`
      ).then((result) => {
        if (cancelled) return;
        setStep(result.exists ? "localizacao" : "numero");
      }).catch(() => { if (!cancelled) setStep("numero"); });
      return () => { cancelled = true; };
    }

    setStep("numero");
    return () => { cancelled = true; };
  }, [wristbandToken, printedNumberParam]);

  async function handleNumberSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!printedNumber.trim()) {
      setError(t.numeroRequired);
      return;
    }
    setChecking(true);
    try {
      const result = await apiRequest<{ exists: boolean }>(
        `/public/wristbands/${encodeURIComponent(printedNumber.trim())}/check`
      );
      if (!result.exists) {
        setError(t.numeroNotFound);
        return;
      }
      setValidatedToken(null);
      setStep("localizacao");
    } catch {
      setError(t.networkError);
    } finally {
      setChecking(false);
    }
  }

  async function sendAlert(payload: {
    latitude?: number;
    longitude?: number;
    locationAccuracy?: number;
    beachId?: string;
    referencePoint?: string;
  }) {
    if (requestInFlight.current || incidentId) return;
    requestInFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await apiRequest<{ id: string; status: IncidentStatus }>("/public/incidents", {
        method: "POST",
        body: validatedToken
          ? { wristbandToken: validatedToken, ...payload }
          : { printedNumber: printedNumber.trim(), ...payload },
      });
      setIncidentId(result.id);
      setLiveStatus(result.status);
      setStep("confirmado");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t.submitError;
      setError(`${message} ${t.tapToRetry}`);
    } finally {
      requestInFlight.current = false;
      setSending(false);
    }
  }

  function requestLocation() {
    if (locationInFlight.current || requestInFlight.current || incidentId) return;
    setError(null);
    if (!("geolocation" in navigator)) {
      setStep("fallback");
      return;
    }
    locationInFlight.current = true;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationInFlight.current = false;
        setLocating(false);
        sendAlert({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationAccuracy: position.coords.accuracy,
        });
      },
      () => { locationInFlight.current = false; setLocating(false); setStep("fallback"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Acompanhamento ao vivo do status apos o alerta - so o status, nunca
  // localizacao ou dado pessoal. Para sozinho quando chega a um estado final.
  useEffect(() => {
    if (step !== "confirmado" || !incidentId) return;

    let cancelled = false;
    let polling = false;
    const interval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await apiRequest<{ status: IncidentStatus }>(
          `/public/incidents/${incidentId}/status`
        );
        if (!cancelled) {
          setStatusError(false);
          setLiveStatus(result.status);
          if (FINAL_STATUSES.includes(result.status)) clearInterval(interval);
        }
      } catch {
        if (!cancelled) setStatusError(true);
      } finally { polling = false; }
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, incidentId]);

  useEffect(() => {
    if (step === "fallback" && beaches.length === 0) {
      setLoadingBeaches(true);
      apiRequest<Beach[]>("/public/beaches")
        .then(setBeaches)
        .catch(() => setError(t.beachesLoadError))
        .finally(() => setLoadingBeaches(false));
    }
  }, [step, beaches.length, t.beachesLoadError]);

  function handleFallbackSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedBeachId && !referencePoint.trim()) {
      setError(t.fallbackRequired);
      return;
    }
    sendAlert({
      beachId: selectedBeachId || undefined,
      referencePoint: referencePoint.trim() || undefined,
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ocean-700 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-3 flex justify-end gap-1">
          {(["pt", "en", "es"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              aria-label={`${code === "pt" ? "Português" : code === "en" ? "English" : "Español"}`}
              className={`rounded px-2 py-1 text-xs font-bold ${
                lang === code ? "bg-ocean-600 text-white" : "bg-ocean-50 text-ocean-700"
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-lg" />
          <h1 className="text-xl font-bold text-ocean-900">{t.headerTitle}</h1>
        </div>

        {step === "verificando_token" && (
          <p role="status" aria-live="polite" className="text-center text-ocean-700">{t.loading}</p>
        )}

        {step === "numero" && (
          <form onSubmit={handleNumberSubmit} className="space-y-4">
            <p className="text-center text-base text-ocean-800">
              {t.numeroPrompt}
            </p>
            <div>
              <label htmlFor="printedNumber" className="mb-1 block text-sm font-semibold text-ocean-900">
                {t.numeroLabel}
              </label>
              <input
                id="printedNumber"
                inputMode="numeric"
                autoFocus
                value={printedNumber}
                onChange={(e) => setPrintedNumber(e.target.value)}
                className="w-full rounded-xl border-2 border-ocean-200 px-4 py-4 text-center text-3xl font-bold tracking-widest text-ocean-900 focus:border-ocean-500"
                placeholder="0000"
              />
            </div>
            {error && <p role="alert" className="text-center text-sm font-medium text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={checking}
              className="w-full rounded-xl bg-ocean-600 px-6 py-5 text-xl font-bold text-white shadow-md transition hover:bg-ocean-700 disabled:opacity-60"
            >
              {checking ? t.checking : t.continueBtn}
            </button>
          </form>
        )}

        {step === "localizacao" && (
          <div className="space-y-5 text-center">
            <p className="text-base text-ocean-800">
              {t.locationPrompt}
            </p>
            {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
            <button
              onClick={requestLocation}
              disabled={sending || locating}
              className="w-full rounded-xl bg-red-600 px-6 py-5 text-lg font-bold text-white shadow-md transition hover:bg-red-700 disabled:opacity-60"
            >
              {locating ? t.locating : sending ? t.sending : t.shareLocationBtn}
            </button>
            <button
              disabled={sending || locating}
              onClick={() => setStep("fallback")}
              className="text-sm font-medium text-ocean-600 underline underline-offset-2"
            >
              {t.cannotShare}
            </button>
          </div>
        )}

        {step === "fallback" && (
          <form onSubmit={handleFallbackSubmit} className="space-y-4">
            <p className="text-center text-sm font-medium text-ocean-800">
              {t.fallbackPrompt}
            </p>
            <div>
              <label htmlFor="beach" className="mb-1 block text-sm font-semibold text-ocean-900">
                {t.beachLabel}
              </label>
              <select
                id="beach"
                value={selectedBeachId}
                onChange={(e) => setSelectedBeachId(e.target.value)}
                disabled={loadingBeaches}
                className="w-full rounded-xl border-2 border-ocean-200 px-4 py-3 text-lg text-ocean-900 focus:border-ocean-500 disabled:opacity-60"
              >
                <option value="">{loadingBeaches ? t.loading : t.selectPlaceholder}</option>
                {beaches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reference" className="mb-1 block text-sm font-semibold text-ocean-900">
                {t.referenceLabel}
              </label>
              <input
                id="reference"
                value={referencePoint}
                onChange={(e) => setReferencePoint(e.target.value)}
                placeholder={t.referencePlaceholder}
                className="w-full rounded-xl border-2 border-ocean-200 px-4 py-3 text-lg text-ocean-900 focus:border-ocean-500"
              />
            </div>
            {error && <p role="alert" className="text-center text-sm font-medium text-red-600">{error}</p>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={requestLocation}
                disabled={sending || locating}
                className="w-full rounded-xl border-2 border-ocean-300 px-4 py-3 font-semibold text-ocean-700"
              >
                {t.retryLocation}
              </button>
              <button
                type="submit"
                disabled={sending || locating}
                className="w-full rounded-xl bg-red-600 px-6 py-5 text-lg font-bold text-white shadow-md transition hover:bg-red-700 disabled:opacity-60"
              >
                {locating ? t.locating : sending ? t.sending : t.sendAlertBtn}
              </button>
            </div>
          </form>
        )}

        {step === "confirmado" && (
          <div role="status" aria-live="polite" className="space-y-3 text-center">
            {(() => {
              const StatusIcon = STATUS_META[liveStatus].icon;
              return (
                <StatusIcon
                  className={`mx-auto h-14 w-14 ${STATUS_META[liveStatus].iconClassName}`}
                  aria-hidden="true"
                />
              );
            })()}
            <h2 className="text-xl font-bold text-green-700">
              {t.status[liveStatus].title}
            </h2>
            <p className="text-base text-ocean-800">{t.status[liveStatus].text}</p>
            {statusError && <p role="alert" className="text-sm text-orange-700">{t.statusConnError}</p>}
            {!FINAL_STATUSES.includes(liveStatus) && (
              <p className="text-xs text-ocean-400" aria-hidden="true">{t.autoUpdating}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
