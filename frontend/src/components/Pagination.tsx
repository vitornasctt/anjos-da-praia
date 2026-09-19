import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  rangeLabel: string;
  busy?: boolean;
}

// Paginacao por cursor: "Anterior"/"Proxima" (nao ha como pular direto
// para uma pagina N em keyset pagination sem manter um indice separado,
// e nao vale a complexidade extra para uma tabela administrativa).
export function Pagination({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  rangeLabel,
  busy = false,
}: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ocean-100 pt-3 text-sm">
      <span role="status" aria-live="polite" className="text-ocean-600">
        {rangeLabel}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="pageSize" className="text-ocean-600">
          Itens por página
        </label>
        <select
          id="pageSize"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={busy}
          className="rounded-lg border border-ocean-200 px-2 py-2 text-base disabled:opacity-60 sm:py-1.5 sm:text-sm"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious || busy}
            aria-label="Página anterior"
            className="flex items-center gap-1 rounded-lg border border-ocean-200 px-3 py-2.5 font-medium text-ocean-700 hover:bg-ocean-50 disabled:opacity-40 sm:py-1.5"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext || busy}
            aria-label="Próxima página"
            className="flex items-center gap-1 rounded-lg border border-ocean-200 px-3 py-2.5 font-medium text-ocean-700 hover:bg-ocean-50 disabled:opacity-40 sm:py-1.5"
          >
            Próxima
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
