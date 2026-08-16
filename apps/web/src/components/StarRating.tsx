"use client";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="relative inline-block leading-none" aria-label={`${value} out of 5 stars`}>
      <span className="text-dim/40">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden whitespace-nowrap text-star" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1 text-2xl">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={n <= value ? "text-star" : "text-dim/40"}
          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
