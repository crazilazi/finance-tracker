import React from 'react';

export default function HealthGauge({ score }) {
  // SVG Arc length (circumference of half-circle with radius 80) is 251.2
  const maxDash = 251.2;
  const dashOffset = maxDash - (score / 100) * maxDash;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[180px]">
        {/* Background Arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="gauge-bg"
        />
        {/* Active Arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="251.2"
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#ef4444' }} />
            <stop offset="50%" style={{ stopColor: '#f59e0b' }} />
            <stop offset="100%" style={{ stopColor: '#10b981' }} />
          </linearGradient>
        </defs>
        <text
          x="100"
          y="80"
          textAnchor="middle"
          fill="currentColor"
          className="text-3xl font-black select-none font-sans text-white"
        >
          {score}
        </text>
        <text
          x="100"
          y="100"
          textAnchor="middle"
          fill="currentColor"
          className="text-[10px] uppercase font-bold tracking-wider select-none font-sans text-gray-400"
        >
          / 100
        </text>
      </svg>
    </div>
  );
}
