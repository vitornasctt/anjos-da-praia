import { Loader2 } from "lucide-react";

// Spinner inline para feedback de "processando" dentro de botoes/linhas.
// Usa animate-spin (CSS @keyframes) - a regra global em index.css ja
// neutraliza qualquer animation/transition quando prefers-reduced-motion
// esta ativo, entao nao precisa de tratamento extra aqui.
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
}
