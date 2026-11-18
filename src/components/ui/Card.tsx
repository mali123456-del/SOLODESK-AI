import React from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  padding = 'md',
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#172338] text-slate-900 dark:text-slate-100',
        paddingMap[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, className }) => (
  <div
    className={cn(
      'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4',
      className
    )}
  >
    <div className="min-w-0 flex-1">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 break-words">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 break-words">
          {description}
        </p>
      )}
    </div>
    {action && <div className="shrink-0 max-w-full">{action}</div>}
  </div>
);
