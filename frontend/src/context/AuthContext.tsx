import { disconnectSocket } from "../services/socket";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { AuthUser } from "../types";
import { apiRequest } from "../services/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expired = () => { setUser(null); disconnectSocket(); };
    window.addEventListener("session-expired", expired);
    apiRequest<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  async function login(email: string, password: string) {
    const result = await apiRequest<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(result.user);
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    disconnectSocket();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return ctx;
}
