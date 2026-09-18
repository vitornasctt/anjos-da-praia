// Blocos "pulsantes" para antecipar o layout real enquanto os dados
// carregam (evita o salto brusco de layout vazio -> conteudo, e evita
// mostrar uma mensagem de "vazio" enquanto ainda esta carregando).
// animate-pulse e CSS puro - tambem neutralizado por prefers-reduced-motion
// via regra global em index.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ocean-100 ${className}`} aria-hidden="true" />;
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" role="status" aria-label="Carregando indicadores">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-ocean-100 bg-white p-4">
          <Skeleton className="mb-2 h-8 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Carregando itens">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
