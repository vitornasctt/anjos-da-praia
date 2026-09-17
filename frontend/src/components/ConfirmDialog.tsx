import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Substitui window.confirm() nas acoes destrutivas (excluir/apagar dados):
// o dialog nativo do navegador nao segue o visual do app e trava em alguns
// contextos de automacao. Fecha com Escape e ao clicar fora, como um
// dialog nativo se comportaria.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Foco inicial vai pro botao mais seguro: em dialogs destrutivos, isso evita
    // que um Enter "de habito" logo apos abrir dispare a acao irreversivel sem
    // o usuario ter escolhido isso ativamente (o mouse sempre pode ir direto no
    // botao vermelho, mas o teclado nao deve ser guiado pra la por padrao).
    (destructive ? cancelRef : confirmRef).current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Trava o foco dentro do dialog: so ha dois elementos focaveis (Cancelar
      // e Confirmar/Excluir), entao Tab/Shift+Tab so alterna entre eles em vez
      // de escapar pro conteudo da pagina por tras do backdrop.
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, destructive, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-900/50 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              destructive ? "bg-red-50 text-red-600" : "bg-ocean-50 text-ocean-600"
            }`}
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-dialog-title" className="text-base font-bold text-ocean-900">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="mt-1 text-sm text-ocean-600">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-ocean-200 px-4 py-2 text-sm font-semibold text-ocean-700 hover:bg-ocean-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-ocean-600 hover:bg-ocean-700"
            }`}
          >
            {busy ? "Aguarde..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
