import { ChangeEvent, FormEvent, useId, useState } from "react";
import { UserPlus, Search, X } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { SkeletonRows } from "../../components/Skeleton";
import { useCursorPage } from "../../hooks/useCursorPage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Family, Wristband } from "../../types";

const emptyForm = {
  responsibleName: "",
  responsiblePhone: "",
  childFirstName: "",
  optionalIdentificationNote: "",
  printedNumber: "",
  photoUrl: "",
};

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
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Family | null>(null);

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
    setSaving(true);
    try {
      await apiRequest("/families/intake", { method: "POST", body: form });
      setSuccess(`Cadastro concluído! Pulseira #${form.printedNumber} associada a ${form.childFirstName}.`);
      setForm(emptyForm);
      reloadFamilies();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setProcessingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setForm((f) => ({ ...f, photoUrl: dataUrl }));
    } catch {
      setPhotoError("Não foi possível processar a foto. Tente outra imagem.");
    } finally {
      setProcessingPhoto(false);
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

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border border-ocean-100 bg-white p-6 shadow-sm sm:grid-cols-2">
        <Field label="Nome do responsável" value={form.responsibleName} onChange={(v) => setForm({ ...form, responsibleName: v })} required />
        <Field label="Telefone do responsável" value={form.responsiblePhone} onChange={(v) => setForm({ ...form, responsiblePhone: v })} required placeholder="(27) 99999-0000" />
        <Field label="Nome da criança" value={form.childFirstName} onChange={(v) => setForm({ ...form, childFirstName: v })} required />
        <Field label="Número da pulseira" value={form.printedNumber} onChange={(v) => setForm({ ...form, printedNumber: v })} required />
        <div className="sm:col-span-2">
          <Field
            label="Observação (opcional, só se necessária para identificação)"
            value={form.optionalIdentificationNote}
            onChange={(v) => setForm({ ...form, optionalIdentificationNote: v })}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="childPhoto" className="mb-1 block text-sm font-semibold text-ocean-900">
            Foto da criança (opcional, ajuda a equipe a confirmar identidade)
          </label>
          <div className="flex items-center gap-3">
            {form.photoUrl && (
              <img
                src={form.photoUrl}
                alt="Prévia da foto da criança"
                className="h-16 w-16 rounded-lg border border-ocean-200 object-cover"
              />
            )}
            <input
              id="childPhoto"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              disabled={processingPhoto}
              className="text-sm text-ocean-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ocean-100 file:px-3 file:py-2 file:font-semibold file:text-ocean-700 disabled:opacity-60"
            />
            {processingPhoto && (
              <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-ocean-600">
                <Spinner className="h-4 w-4" />
                Processando foto...
              </span>
            )}
            {form.photoUrl && !processingPhoto && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, photoUrl: "" }))}
                className="text-sm font-medium text-ocean-600 underline"
              >
                Remover
              </button>
            )}
          </div>
          {photoError && <p role="alert" className="mt-1 text-sm text-red-600">{photoError}</p>}
        </div>

        {error && <p role="alert" className="sm:col-span-2 text-sm font-medium text-red-600">{error}</p>}
        {success && <p role="status" className="sm:col-span-2 text-sm font-medium text-green-700">{success}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-ocean-600 px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-ocean-700 disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Salvando..." : "Cadastrar família e pulseira"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-ocean-900">Buscar pulseira</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <label htmlFor="searchNumber" className="sr-only">Número da pulseira</label>
          <input
            id="searchNumber"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            placeholder="Número da pulseira"
            className="flex-1 rounded-lg border border-ocean-200 px-3 py-2"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-ocean-100 px-4 py-2 font-semibold text-ocean-700 hover:bg-ocean-200"
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
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ocean-100 bg-white p-6 shadow-sm">
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
              className="w-full rounded-lg border border-ocean-200 py-2 pl-9 pr-8 text-sm"
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
          <ul className="divide-y divide-ocean-50 text-sm">
            {families.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{f.responsibleName}</span>
                <span className="text-ocean-500">{f.responsiblePhone}</span>
                <span>
                  {f.children?.map((c) => `${c.firstName} (#${c.wristbands?.[0]?.printedNumber ?? "—"})`).join(", ")}
                </span>
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
              </li>
            ))}
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
        description={`Apagar os dados pessoais de "${confirmTarget?.responsibleName}" (foto, nome, telefone e dados da criança)? A ocorrência continua no histórico, só os dados de identificação somem. Isso não pode ser desfeito.`}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
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
        className="w-full rounded-lg border border-ocean-200 px-3 py-2 focus:border-ocean-500"
      />
    </div>
  );
}
