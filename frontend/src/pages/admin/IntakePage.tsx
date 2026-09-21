import { ChangeEvent, FormEvent, useId, useState } from "react";
import { UserPlus, Search, X, Plus, Trash2, ChevronDown } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { SkeletonRows } from "../../components/Skeleton";
import { useCursorPage } from "../../hooks/useCursorPage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Family, Wristband } from "../../types";

const MAX_CHILDREN = 10; // mesmo limite da API (MAX_CHILDREN_PER_INTAKE)

const emptyGuardian = {
  responsibleName: "",
  responsiblePhone: "",
  responsibleAddress: "",
};

// Cada crianca tem seu proprio bloco de campos e sua propria pulseira; a
// familia inteira e enviada em uma unica chamada.
interface ChildDraft {
  key: number;
  firstName: string;
  printedNumber: string;
  optionalIdentificationNote: string;
  photoUrl: string;
  processingPhoto: boolean;
  photoError: string | null;
}

let nextChildKey = 1;
function newChildDraft(): ChildDraft {
  return {
    key: nextChildKey++,
    firstName: "",
    printedNumber: "",
    optionalIdentificationNote: "",
    photoUrl: "",
    processingPhoto: false,
    photoError: null,
  };
}

const PHOTO_MAX_DIMENSION = 480;
const PHOTO_QUALITY = 0.7;

// Redimensiona e comprime a foto no proprio navegador antes de enviar -
// evita fotos de varios MB do celular indo direto pro banco de dados.
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Nao foi possivel processar a imagem."));
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponivel."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const FAMILIES_PAGE_SIZE_KEY = "familiesPage.pageSize";

export function IntakePage() {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyGuardian);
  const [kids, setKids] = useState<ChildDraft[]>(() => [newChildDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Family | null>(null);
  // Familias com os detalhes abertos; a lista mostra so o nome do responsavel.
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(() => new Set());

  function toggleFamily(id: string) {
    setExpandedFamilies((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [searchNumber, setSearchNumber] = useState("");
  const [searchResult, setSearchResult] = useState<Wristband | null | "not_found">(null);
  const [searching, setSearching] = useState(false);

  const [familySearchInput, setFamilySearchInput] = useState("");
  const familySearch = useDebouncedValue(familySearchInput);
  const [familyPageSize, setFamilyPageSize] = useState(() => Number(localStorage.getItem(FAMILIES_PAGE_SIZE_KEY)) || 20);
  const {
    items: families,
    total: familiesTotal,
    loading: loadingFamilies,
    error: familiesError,
    hasNext: familiesHasNext,
    hasPrevious: familiesHasPrevious,
    goNext: familiesGoNext,
    goPrevious: familiesGoPrevious,
    reload: reloadFamilies,
  } = useCursorPage<Family>({ path: "/families", pageSize: familyPageSize, search: familySearch });

  function handleFamilyPageSizeChange(size: number) {
    setFamilyPageSize(size);
    localStorage.setItem(FAMILIES_PAGE_SIZE_KEY, String(size));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numbers = kids.map((k) => k.printedNumber.trim());
    const repeated = numbers.find((n, i) => numbers.indexOf(n) !== i);
    if (repeated) {
      setError(`A pulseira ${repeated} foi digitada para mais de uma criança. Cada criança precisa de uma pulseira diferente.`);
      return;
    }
    if (kids.some((k) => k.processingPhoto)) {
      setError("Aguarde o processamento das fotos.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest("/families/intake", {
        method: "POST",
        body: {
          ...form,
          children: kids.map((k) => ({
            firstName: k.firstName,
            printedNumber: k.printedNumber,
            optionalIdentificationNote: k.optionalIdentificationNote,
            photoUrl: k.photoUrl,
          })),
        },
      });
      const summary = kids.map((k) => `#${k.printedNumber.trim()} (${k.firstName.trim()})`).join(", ");
      setSuccess(
        kids.length === 1
          ? `Cadastro concluído! Pulseira ${summary} associada.`
          : `Cadastro concluído! ${kids.length} crianças na mesma família. Pulseiras: ${summary}.`
      );
      setForm(emptyGuardian);
      setKids([newChildDraft()]);
      reloadFamilies();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  function updateKid(key: number, patch: Partial<ChildDraft>) {
    setKids((list) => list.map((k) => (k.key === key ? { ...k, ...patch } : k)));
  }

  function addKid() {
    setKids((list) => (list.length >= MAX_CHILDREN ? list : [...list, newChildDraft()]));
  }

  function removeKid(key: number) {
    setKids((list) => (list.length <= 1 ? list : list.filter((k) => k.key !== key)));
  }

  async function handlePhotoChange(key: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateKid(key, { photoError: null, processingPhoto: true });
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      updateKid(key, { photoUrl: dataUrl });
    } catch {
      updateKid(key, { photoError: "Não foi possível processar a foto. Tente outra imagem." });
    } finally {
      updateKid(key, { processingPhoto: false });
    }
  }

  async function confirmDeletePersonalData() {
    if (!confirmTarget) return;
    const family = confirmTarget;
    setDeletingId(family.id);
    setError(null);
    try {
      await apiRequest(`/families/${family.id}/personal-data`, { method: "DELETE" });
      reloadFamilies();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apagar os dados.");
    } finally {
      setDeletingId(null);
      setConfirmTarget(null);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchNumber.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const result = await apiRequest<Wristband>(
        `/wristbands/search?printedNumber=${encodeURIComponent(searchNumber.trim())}`
      );
      setSearchResult(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setSearchResult("not_found");
      else setError(err instanceof ApiError ? err.message : "Não foi possível buscar a pulseira.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <UserPlus className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        Cadastro rápido
      </h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6">
        <Field label="Nome do responsável" value={form.responsibleName} onChange={(v) => setForm({ ...form, responsibleName: v })} required />
        <Field label="Telefone do responsável" value={form.responsiblePhone} onChange={(v) => setForm({ ...form, responsiblePhone: v })} required placeholder="(27) 99999-0000" />
        <div className="sm:col-span-2">
          <Field
            label="Endereço do responsável (opcional)"
            value={form.responsibleAddress}
            onChange={(v) => setForm({ ...form, responsibleAddress: v })}
            placeholder="Rua, número, bairro, cidade"
            maxLength={200}
          />
        </div>

        <div className="sm:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-ocean-900">
            {kids.length === 1 ? "Criança" : `Crianças (${kids.length})`}
          </h2>

          {kids.map((kid, index) => (
            <fieldset key={kid.key} className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-ocean-100 bg-ocean-50/40 p-3 sm:grid-cols-2 sm:p-4">
              <legend className="px-2 text-sm font-bold text-ocean-700">Criança {index + 1}</legend>
              <Field
                label="Nome da criança"
                value={kid.firstName}
                onChange={(v) => updateKid(kid.key, { firstName: v })}
                required
                maxLength={80}
              />
              <Field
                label="Número da pulseira"
                value={kid.printedNumber}
                onChange={(v) => updateKid(kid.key, { printedNumber: v })}
                required
                maxLength={20}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Observação (opcional, só se necessária para identificação)"
                  value={kid.optionalIdentificationNote}
                  onChange={(v) => updateKid(kid.key, { optionalIdentificationNote: v })}
                  maxLength={280}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`childPhoto-${kid.key}`} className="mb-1 block text-sm font-semibold text-ocean-900">
                  Foto da criança (opcional, ajuda a equipe a confirmar identidade)
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {kid.photoUrl && (
                    <img
                      src={kid.photoUrl}
                      alt={`Prévia da foto da criança ${index + 1}`}
                      className="h-16 w-16 rounded-lg border border-ocean-200 object-cover"
                    />
                  )}
                  <input
                    id={`childPhoto-${kid.key}`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handlePhotoChange(kid.key, e)}
                    disabled={kid.processingPhoto}
                    className="w-full min-w-0 max-w-full text-sm text-ocean-700 sm:w-auto file:mr-3 file:rounded-lg file:border-0 file:bg-ocean-100 file:px-3 file:py-2 file:font-semibold file:text-ocean-700 disabled:opacity-60"
                  />
                  {kid.processingPhoto && (
                    <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-ocean-600">
                      <Spinner className="h-4 w-4" />
                      Processando foto...
                    </span>
                  )}
                  {kid.photoUrl && !kid.processingPhoto && (
                    <button
                      type="button"
                      onClick={() => updateKid(kid.key, { photoUrl: "" })}
                      className="text-sm font-medium text-ocean-600 underline"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
                {kid.photoError && <p role="alert" className="mt-1 text-sm text-red-600">{kid.photoError}</p>}
              </div>

              {kids.length > 1 && (
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => removeKid(kid.key)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 underline"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remover criança {index + 1}
                  </button>
                </div>
              )}
            </fieldset>
          ))}

          <button
            type="button"
            onClick={addKid}
            disabled={kids.length >= MAX_CHILDREN}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-ocean-300 px-4 py-3 font-semibold text-ocean-700 hover:bg-ocean-50 disabled:opacity-60"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Adicionar outra criança da mesma família
          </button>
        </div>

        {error && <p role="alert" className="sm:col-span-2 text-sm font-medium text-red-600">{error}</p>}
        {success && <p role="status" className="sm:col-span-2 text-sm font-medium text-green-700">{success}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-ocean-600 px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-ocean-700 disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Salvando..." : kids.length === 1 ? "Cadastrar família e pulseira" : `Cadastrar família e ${kids.length} pulseiras`}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Buscar pulseira</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <label htmlFor="searchNumber" className="sr-only">Número da pulseira</label>
          <input
            id="searchNumber"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            placeholder="Número da pulseira"
            className="min-w-0 flex-1 rounded-lg border border-ocean-200 px-3 py-2"
          />
          <button
            type="submit"
            disabled={searching}
            className="shrink-0 rounded-lg bg-ocean-100 px-4 py-2 font-semibold text-ocean-700 hover:bg-ocean-200"
          >
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </form>
        {searchResult === "not_found" && <p role="alert" className="mt-3 text-sm text-red-600">Pulseira não encontrada.</p>}
        {searchResult && searchResult !== "not_found" && (
          <div role="status" className="mt-3 rounded-lg bg-ocean-50 p-4 text-sm">
            <p><strong>Status:</strong> {searchResult.status}</p>
            <p><strong>Criança:</strong> {searchResult.child?.firstName ?? "—"}</p>
            <p><strong>Responsável:</strong> {searchResult.child?.family?.responsibleName ?? "—"}</p>
            <p><strong>Telefone:</strong> {searchResult.child?.family?.responsiblePhone ?? "—"}</p>
            {searchResult.child?.family?.responsibleAddress && (
              <p><strong>Endereço:</strong> {searchResult.child.family.responsibleAddress}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Famílias cadastradas</h2>

        <div className="mb-4">
          <label htmlFor="familySearch" className="sr-only">Buscar família por nome do responsável</label>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ocean-400" aria-hidden="true" />
            <input
              id="familySearch"
              value={familySearchInput}
              onChange={(e) => setFamilySearchInput(e.target.value)}
              placeholder="Buscar por nome do responsável"
              className="w-full rounded-lg border border-ocean-200 py-2 pl-9 pr-8 text-base sm:text-sm"
            />
            {familySearchInput && (
              <button
                type="button"
                onClick={() => setFamilySearchInput("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ocean-400 hover:text-ocean-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {familiesError && (
          <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-red-600">
            <span>{familiesError}</span>
            <button type="button" onClick={reloadFamilies} className="font-medium underline">Tentar novamente</button>
          </div>
        )}

        {loadingFamilies ? (
          <SkeletonRows count={Math.min(familyPageSize, 5)} />
        ) : families.length === 0 ? (
          <p className="py-2 text-ocean-500">
            {familySearch ? `Nenhuma família encontrada para "${familySearch}".` : "Nenhuma família cadastrada ainda."}
          </p>
        ) : (
          <ul className="divide-y divide-ocean-100">
            {families.map((f) => {
              const open = expandedFamilies.has(f.id);
              const detailsId = `family-details-${f.id}`;
              return (
                <li key={f.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words text-base font-semibold text-ocean-900">{f.responsibleName}</span>
                    <button
                      type="button"
                      onClick={() => toggleFamily(f.id)}
                      aria-expanded={open}
                      aria-controls={detailsId}
                      aria-label={`${open ? "Ocultar" : "Ver"} dados de ${f.responsibleName}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ocean-200 px-3 py-2 text-sm font-semibold text-ocean-700 hover:bg-ocean-50"
                    >
                      {open ? "Ocultar dados" : "Ver dados"}
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </div>

                  {open && (
                    <div id={detailsId} className="mt-3 space-y-4 rounded-lg bg-ocean-50 p-4 text-sm">
                      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
                        <dt className="font-semibold text-ocean-700">Telefone</dt>
                        <dd className="break-words text-ocean-900">{f.responsiblePhone}</dd>

                        {f.responsibleAddress && (
                          <>
                            <dt className="font-semibold text-ocean-700">Endereço</dt>
                            <dd className="break-words text-ocean-900">{f.responsibleAddress}</dd>
                          </>
                        )}

                        <dt className="font-semibold text-ocean-700">
                          {(f.children?.length ?? 0) === 1 ? "Criança" : "Crianças"}
                        </dt>
                        <dd className="text-ocean-900">
                          {f.children && f.children.length > 0 ? (
                            <ul className="space-y-1.5">
                              {f.children.map((c) => (
                                <li key={c.id}>
                                  <span className="font-medium">{c.firstName}</span>
                                  <span className="text-ocean-600"> · pulseira #{c.wristbands?.[0]?.printedNumber ?? "—"}</span>
                                  {c.optionalIdentificationNote && (
                                    <span className="block text-ocean-600">{c.optionalIdentificationNote}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </dl>

                      {user?.role === "ADMIN" && (
                        <button
                          type="button"
                          onClick={() => setConfirmTarget(f)}
                          disabled={deletingId === f.id}
                          aria-label={`Apagar dados pessoais de ${f.responsibleName}`}
                          className="text-sm font-medium text-red-600 underline disabled:opacity-60"
                        >
                          {deletingId === f.id ? "Apagando..." : "Apagar dados pessoais"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loadingFamilies && familiesTotal > 0 && (
          <div className="mt-4">
            <Pagination
              onPrevious={familiesGoPrevious}
              onNext={familiesGoNext}
              hasPrevious={familiesHasPrevious}
              hasNext={familiesHasNext}
              pageSize={familyPageSize}
              onPageSizeChange={handleFamilyPageSizeChange}
              rangeLabel={`${families.length} de ${familiesTotal} família(s)`}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Apagar dados pessoais"
        description={`Apagar os dados pessoais de "${confirmTarget?.responsibleName}" (foto, nome, telefone, endereço e dados das crianças)? A ocorrência continua no histórico, só os dados de identificação somem. Isso não pode ser desfeito.`}
        confirmLabel="Apagar dados"
        busy={deletingId === confirmTarget?.id}
        onConfirm={confirmDeletePersonalData}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ocean-900">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-lg border border-ocean-200 px-3 py-2 focus:border-ocean-500"
      />
    </div>
  );
}
