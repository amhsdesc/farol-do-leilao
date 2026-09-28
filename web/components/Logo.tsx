// Símbolo do Farol do Leilão (marca "Luz amiga"). Cores fixas da marca, independentes do tema.
export function Simbolo({ tamanho = 32, invertido = false }: { tamanho?: number; invertido?: boolean }) {
  const torre = invertido ? "#ffffff" : "#4B3BB0";
  const base = invertido ? "#ffffff" : "#1F1B2E";
  return (
    <svg width={(tamanho * 104) / 120} height={tamanho} viewBox="0 0 104 120" aria-hidden="true">
      <circle cx="52" cy="26" r="24" fill="#FFC93C" opacity="0.35" />
      <circle cx="52" cy="26" r="13" fill="#FFC93C" />
      <rect x="40" y="36" width="24" height="10" rx="5" fill={base} />
      <path d="M42 46 L62 46 Q70 110 70 110 L34 110 Q34 110 42 46 Z" fill={torre} />
      <rect x="38" y="66" width="28" height="8" rx="4" fill={invertido ? "#4B3BB0" : "#ffffff"} />
      <rect x="36" y="86" width="32" height="8" rx="4" fill={invertido ? "#4B3BB0" : "#ffffff"} />
      <rect x="24" y="108" width="56" height="8" rx="4" fill={base} />
    </svg>
  );
}
