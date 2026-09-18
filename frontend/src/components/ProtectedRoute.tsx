import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./Spinner";
import { Role } from "../types";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-3 text-ocean-700">
        <Spinner className="h-6 w-6" />
        Carregando...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/painel" replace />;

  return <Outlet />;
}
