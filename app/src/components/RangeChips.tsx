import { RANGES, type Range } from '../lib/portfolio';

export function RangeChips({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="chips range-chips" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={r} type="button" aria-pressed={r === value} onClick={() => onChange(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}
