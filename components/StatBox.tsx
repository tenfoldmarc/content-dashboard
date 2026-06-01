'use client';

import { useEffect, useRef, useState } from 'react';

interface StatBoxProps {
  label: string;
  value: string;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  glow?: 'green' | 'amber' | 'red';
  onClick?: () => void;
}

export default function StatBox({ label, value, change, changeType = 'neutral', glow, onClick }: StatBoxProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate numbers counting up
    const match = value.match(/^([\$]?)([\d,.]+)(K|M|%?)$/);
    if (!match) { setDisplayValue(value); return; }

    const prefix = match[1];
    const suffix = match[3];
    const target = parseFloat(match[2].replace(/,/g, ''));
    if (isNaN(target) || target === 0) { setDisplayValue(value); return; }

    const duration = 800;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (value.includes(',')) {
        setDisplayValue(prefix + Math.round(current).toLocaleString() + suffix);
      } else if (value.includes('.')) {
        setDisplayValue(prefix + current.toFixed(1) + suffix);
      } else {
        setDisplayValue(prefix + Math.round(current) + suffix);
      }

      if (progress < 1) requestAnimationFrame(tick);
      else setDisplayValue(value);
    }

    requestAnimationFrame(tick);
  }, [value]);

  const glowStyle = glow === 'green'
    ? { boxShadow: '0 0 30px rgba(34,197,94,.1)' }
    : glow === 'amber'
    ? { boxShadow: '0 0 30px rgba(245,158,11,.1)' }
    : glow === 'red'
    ? { boxShadow: '0 0 30px rgba(239,68,68,.1)' }
    : {};

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`relative overflow-hidden rounded-card border border-border bg-card/60 backdrop-blur-xl p-5 transition-all duration-300 ${
        onClick ? 'cursor-pointer' : ''
      } hover:-translate-y-[3px] hover:shadow-[0_12px_40px_rgba(0,0,0,.35)] hover:border-border-hover animate-fade-in-scale`}
      style={glowStyle}
    >
      <div className="text-[.72rem] uppercase tracking-[1px] text-muted mb-1.5">{label}</div>
      <div className="font-mono text-[2rem] tracking-[1px] text-cream leading-tight">{displayValue}</div>
      {change && (
        <div className={`text-[.72rem] mt-1 ${
          changeType === 'up' ? 'text-accent' : changeType === 'down' ? 'text-red' : 'text-muted'
        }`}>
          {change}
        </div>
      )}
    </div>
  );
}
