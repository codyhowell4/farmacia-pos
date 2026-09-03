import React from 'react';

const SIZES = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl',
};

// Farmacia Apolo wordmark: "— FARMACIA —" over "APOLO" with a green dot.
// `light` renders white text for navy backgrounds.
const ApoloBrand = ({ size = 'md', light = false, className = '' }) => (
  <div className={`flex flex-col items-center leading-none select-none ${className}`}>
    <span className={`text-[10px] tracking-[0.35em] font-medium ${light ? 'text-white/80' : 'text-apolo-navy/80'}`}>
      — FARMACIA —
    </span>
    <span className={`font-bold tracking-[0.18em] ${SIZES[size] || SIZES.md} ${light ? 'text-white' : 'text-apolo-navy'}`}>
      APOLO
    </span>
    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-apolo-green" />
  </div>
);

export default ApoloBrand;
