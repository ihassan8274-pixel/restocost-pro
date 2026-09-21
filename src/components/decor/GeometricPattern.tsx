import React from 'react';

const TILE = 96;

export const GeometricPattern: React.FC<{ className?: string; tone?: 'gold' | 'stone'; opacity?: number }> = ({ className, tone = 'stone', opacity = 1 }) => {
  const stroke = tone === 'gold' ? '#d97706' : '#a8a29e';
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 w-full h-full ${className ?? ''}`} style={{ opacity }}>
      <defs>
        <pattern id={`ar-${tone}`} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <rect width={TILE} height={TILE} fill="none" />
          <g fill="none" stroke={stroke} strokeWidth="1" strokeLinejoin="round">
            <path d="M48 0 L66 30 L96 48 L66 66 L48 96 L30 66 L0 48 L30 30 Z" />
            <circle cx="48" cy="48" r="8" />
          </g>
          <path d="M0 48 L48 48 M96 48 L48 48 M48 0 L48 48 M48 96 L48 48" stroke={stroke} strokeOpacity="0.25" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#ar-${tone})`} />
    </svg>
  );
};