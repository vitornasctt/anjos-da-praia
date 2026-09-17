import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { EncontreiPage } from "./pages/public/EncontreiPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { IncidentDetailPage } from "./pages/dashboard/IncidentDetailPage";
import { IntakePage } from "./pages/admin/IntakePage";
import { TentsBeachesPage } from "./pages/admin/TentsBeachesPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { ReportsPage } from "./pages/admin/ReportsPage";
import { QrCodePage } from "./pages/admin/QrCodePage";
import { MapPage } from "./pages/MapPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/encontrei" element={<EncontreiPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/painel" element={<DashboardPage />} />
            <Route path="/painel/ocorrencias/:id" element={<IncidentDetailPage />} />
            <Route path="/mapa" element={<MapPage />} />

            <Route element={<ProtectedRoute roles={["ADMIN", "ATENDENTE"]} />}>
              <Route path="/cadastro" element={<IntakePage />} />
            </Route>

            <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
              <Route path="/admin/tendas" element={<TentsBeachesPage />} />
              <Route path="/admin/usuarios" element={<UsersPage />} />
              <Route path="/admin/relatorios" element={<ReportsPage />} />
              <Route path="/admin/qrcode" element={<QrCodePage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/painel" replace />} />
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Routes>
    </AuthProvider>
  );
}
