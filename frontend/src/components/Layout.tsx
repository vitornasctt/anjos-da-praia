import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, UserPlus, Map, Tent, Users, BarChart3, QrCode } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard, roles: ["ADMIN", "ATENDENTE", "EQUIPE_CAMPO"] },
  { to: "/cadastro", label: "Cadastro", icon: UserPlus, roles: ["ADMIN", "ATENDENTE"] },
  { to: "/mapa", label: "Mapa", icon: Map, roles: ["ADMIN", "ATENDENTE", "EQUIPE_CAMPO"] },
  { to: "/admin/tendas", label: "Tendas e praias", icon: Tent, roles: ["ADMIN"] },
  { to: "/admin/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN"] },
  { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3, roles: ["ADMIN"] },
  { to: "/admin/qrcode", label: "QR Code", icon: QrCode, roles: ["ADMIN"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  async function handleLogout() {
    setLoggingOut(true); setLogoutError(false);
    try { await logout(); } catch { setLogoutError(true); } finally { setLoggingOut(false); }
  }
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-sand-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ocean-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <header className="no-print border-b border-ocean-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-6 w-6 rounded" />
            <span className="font-bold text-ocean-800">Anjos da Praia</span>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Navegação principal">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-2 font-medium transition ${
                    isActive ? "bg-ocean-600 text-white" : "text-ocean-700 hover:bg-ocean-50"
                  }`
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ocean-700 sm:inline">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border border-ocean-200 px-3 py-2 font-medium text-ocean-700 hover:bg-ocean-50"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6">
        {logoutError && <p role="alert" className="mb-4 text-red-600">Não foi possível sair. Verifique a conexão e tente novamente.</p>}
        <Outlet />
      </main>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  ATENDENTE: "Atendente",
  EQUIPE_CAMPO: "Equipe de campo",
};
