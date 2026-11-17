import React from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6',
        className
      )}
    >
      <div className="min-w-0 shrink-0 max-w-full lg:max-w-lg">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 min-w-0 lg:justify-end">{actions}</div>
      )}
    </div>
  );
};
