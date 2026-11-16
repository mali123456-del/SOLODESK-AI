import React from 'react';

interface SolodeskLogoProps {
  compact?: boolean;
  className?: string;
  inverted?: boolean;
}

export const SolodeskMonogram: React.FC<{ className?: string }> = ({
  className = 'w-8 h-8',
}) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="14" fill="#172338" />
    <rect x="2" y="2" width="60" height="60" rx="12" stroke="#283B5E" strokeWidth="1.5" />
    <path
      d="M19 23.5C19 19.9101 21.9101 17 25.5 17H43.5C44.8807 17 46 18.1193 46 19.5V22.5C46 23.8807 44.8807 25 43.5 25H26.5C25.6716 25 25 25.6716 25 26.5C25 27.3284 25.6716 28 26.5 28H38.5C42.6421 28 46 31.3579 46 35.5V39.5C46 43.6421 42.6421 47 38.5 47H20.5C19.1193 47 18 45.8807 18 44.5V41.5C18 40.1193 19.1193 39 20.5 39H37.5C38.3284 39 39 38.3284 39 37.5C39 36.6716 38.3284 36 37.5 36H25.5C21.9101 36 19 33.0899 19 29.5V23.5Z"
      fill="#2563EB"
    />
    <rect x="38" y="17" width="8" height="8" rx="2.5" fill="#20C7D9" />
    <rect x="18" y="39" width="8" height="8" rx="2.5" fill="#20C7D9" />
  </svg>
);

export const SolodeskLogo: React.FC<SolodeskLogoProps> = ({
  compact = false,
  className = '',
  inverted = false,
}) => {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <SolodeskMonogram className="w-8 h-8 shrink-0" />
      {!compact && (
        <span
          className={`text-base font-bold tracking-tight whitespace-nowrap ${
            inverted ? 'text-white' : 'text-slate-900 dark:text-white'
          }`}
        >
          SOLODESK <span className="text-[#20C7D9]">AI</span>
        </span>
      )}
    </span>
  );
};
