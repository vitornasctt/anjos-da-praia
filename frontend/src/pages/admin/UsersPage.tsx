import { FormEvent, useState } from "react";
import { Users, Search, X } from "lucide-react";
import { apiRequest, ApiError } from "../../services/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/Pagination";
import { SkeletonRows } from "../../components/Skeleton";
import { useCursorPage } from "../../hooks/useCursorPage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Role } from "../../types";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  ATENDENTE: "Atendente",
  EQUIPE_CAMPO: "Equipe de campo",
};

const emptyForm = { name: "", email: "", password: "", role: "ATENDENTE" as Role };
const PAGE_SIZE_KEY = "usersPage.pageSize";

export function UsersPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem(PAGE_SIZE_KEY)) || 20);

  const {
    items: users,
    setItems: setUsers,
    total,
    loading: loadingUsers,
    error: loadError,
    hasNext,
    hasPrevious,
    goNext,
    goPrevious,
    reload,
  } = useCursorPage<AdminUser>({ path: "/users", pageSize, search });

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiRequest("/users", { method: "POST", body: form });
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  // Optimistic: troca visual imediata, com rollback se o PATCH falhar -
  // seguro porque reverter um booleano ativo/inativo e trivial.
  async function toggleActive(user: AdminUser) {
    setError(null);
    setTogglingIds((prev) => new Set(prev).add(user.id));
    const nextActive = !user.active;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: nextActive } : u)));
    try {
      await apiRequest(`/users/${user.id}`, { method: "PATCH", body: { active: nextActive } });
    } catch (err) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: user.active } : u)));
      setError(err instanceof ApiError ? err.message : "Não foi possível alterar o usuário.");
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(user.id); return next; });
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/users/${deleteTarget.id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível excluir o usuário.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ocean-900">
        <Users className="h-6 w-6 text-ocean-600" aria-hidden="true" />
        Usuários da equipe
      </h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6">
        <label htmlFor="userName" className="sr-only">Nome</label>
        <input
          id="userName"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nome"
          required
          className="rounded-lg border border-ocean-200 px-3 py-2"
        />
        <label htmlFor="userEmail" className="sr-only">E-mail</label>
        <input
          id="userEmail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="E-mail"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-ocean-200 px-3 py-2"
        />
        <label htmlFor="userPassword" className="sr-only">Senha provisória</label>
        <input
          id="userPassword"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Senha provisória (mín. 8 caracteres)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-lg border border-ocean-200 px-3 py-2"
        />
        <label htmlFor="userRole" className="sr-only">Perfil</label>
        <select
          id="userRole"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          className="rounded-lg border border-ocean-200 px-3 py-2"
        >
          <option value="ATENDENTE">Atendente</option>
          <option value="EQUIPE_CAMPO">Equipe de campo</option>
          <option value="ADMIN">Administrador</option>
        </select>
        {error && <p role="alert" className="sm:col-span-2 text-sm font-medium text-red-600">{error}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-ocean-600 px-4 py-2 font-semibold text-white hover:bg-ocean-700 disabled:opacity-60"
          >
            {saving ? "Criando..." : "Criar usuário"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-ocean-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="userSearch" className="sr-only">Buscar por nome ou e-mail</label>
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ocean-400" aria-hidden="true" />
            <input
              id="userSearch"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou e-mail"
              className="w-full rounded-lg border border-ocean-200 py-2 pl-9 pr-8 text-base sm:text-sm"
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

        {loadError && (
          <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-red-600">
            <span>{loadError}</span>
            <button type="button" onClick={reload} className="font-medium underline">Tentar novamente</button>
          </div>
        )}

        {loadingUsers ? (
          <SkeletonRows count={Math.min(pageSize, 5)} />
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ocean-200 p-6 text-center text-ocean-500">
            {search ? `Nenhum usuário encontrado para "${search}".` : "Nenhum usuário cadastrado ainda."}
          </p>
        ) : (
          <>
          <table className="hidden w-full text-sm lg:table">
            <thead>
              <tr className="border-b border-ocean-100 text-left text-ocean-500">
                <th scope="col" className="py-2">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Perfil</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ocean-50">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>{u.active ? "Ativo" : "Inativo"}</td>
                  <td>
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={togglingIds.has(u.id)}
                      aria-label={`${u.active ? "Desativar" : "Ativar"} usuário ${u.name}`}
                      className="font-medium text-ocean-600 underline disabled:opacity-50"
                    >
                      {u.active ? "Desativar" : "Ativar"}
                    </button>
                    {u.role !== "ADMIN" && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        aria-label={`Excluir usuário ${u.name}`}
                        className="ml-3 font-medium text-red-600 underline"
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-3 lg:hidden">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border border-ocean-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-base font-bold text-ocean-900">{u.name}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm text-ocean-600">{u.email}</p>
                <p className="mt-1 text-sm text-ocean-700">Perfil: {ROLE_LABELS[u.role] ?? u.role}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={togglingIds.has(u.id)}
                    aria-label={`${u.active ? "Desativar" : "Ativar"} usuário ${u.name}`}
                    className="rounded-lg border border-ocean-200 px-4 py-2.5 text-sm font-semibold text-ocean-700 disabled:opacity-50"
                  >
                    {u.active ? "Desativar" : "Ativar"}
                  </button>
                  {u.role !== "ADMIN" && (
                    <button
                      onClick={() => setDeleteTarget(u)}
                      aria-label={`Excluir usuário ${u.name}`}
                      className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </>
        )}

        {!loadingUsers && total > 0 && (
          <div className="mt-4">
            <Pagination
              onPrevious={goPrevious}
              onNext={goNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              rangeLabel={`${users.length} de ${total} usuário(s)`}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir usuário"
        description={`Excluir o usuário "${deleteTarget?.name}"? Isso não pode ser desfeito.`}
        confirmLabel="Excluir"
        busy={deleting}
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
