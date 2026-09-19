import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // No celular o menu rola na horizontal: mantem a aba atual visivel.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, user]);
  async function handleLogout() {
    setLoggingOut(true); setLogoutError(false);
    try { await logout(); } catch { setLogoutError(true); } finally { setLoggingOut(false); }
  }
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen min-h-dvh bg-sand-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ocean-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <header className="no-print border-b border-ocean-100 bg-white">
        {/* Celular: logo + Sair na primeira linha e o menu numa faixa que rola na horizontal
            (sem quebrar em varias linhas). Desktop: tudo em uma linha so. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/icon.svg" alt="" className="h-7 w-7 shrink-0 rounded" />
            <span className="whitespace-nowrap font-bold text-ocean-800">Anjos da Praia</span>
          </div>
          <div className="order-2 flex items-center gap-3 text-sm md:order-3">
            <span className="hidden text-ocean-700 2xl:inline">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border border-ocean-200 px-4 py-2 font-medium text-ocean-700 hover:bg-ocean-50"
            >
              Sair
            </button>
          </div>
          <nav
            ref={navRef}
            aria-label="Navegação principal"
            className="-mx-4 order-3 w-[calc(100%+2rem)] overflow-x-auto px-4 pb-1 md:order-2 md:mx-0 md:w-auto md:min-w-0 md:flex-1 md:overflow-visible md:px-0 md:pb-0"
          >
            <div className="flex w-max gap-1 text-sm md:w-auto md:flex-wrap">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2.5 font-medium transition md:py-2 ${
                      isActive ? "bg-ocean-600 text-white" : "text-ocean-700 hover:bg-ocean-50"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
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
