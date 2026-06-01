'use client';

export type SortOption = 'recent' | 'likes' | 'views' | 'shares';

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'likes', label: 'Most Likes' },
  { value: 'views', label: 'Most Views' },
  { value: 'shares', label: 'Most Shares' },
];

export default function SortBar({
  active,
  onChange,
}: {
  active: SortOption;
  onChange: (sort: SortOption) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            active === opt.value
              ? 'bg-accent text-white'
              : 'bg-surface text-muted hover:text-cream hover:bg-surface/80'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
