import React, { useId } from 'react';
import { cn } from '../../lib/cn';

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}) => {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          {label}
          {required && (
            <span className="text-red-600 dark:text-red-400 ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, leftIcon, id, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const field = (
      <div className="relative flex items-center">
        {leftIcon && (
          <span
            className="absolute left-3 text-slate-400 pointer-events-none flex items-center"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full h-10 rounded-[10px] border bg-white dark:bg-[#101827] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors',
            leftIcon ? 'pl-9 pr-3' : 'px-3',
            error
              ? 'border-red-500 focus:border-red-600'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
      </div>
    );

    if (!label && !hint && !error) return field;

    return (
      <FormField label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
        {field}
      </FormField>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, required, id, className, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    const field = (
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-[10px] border bg-white dark:bg-[#101827] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors',
          error
            ? 'border-red-500 focus:border-red-600'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
    );

    if (!label && !hint && !error) return field;

    return (
      <FormField label={label} htmlFor={textareaId} hint={hint} error={error} required={required}>
        {field}
      </FormField>
    );
  }
);

Textarea.displayName = 'Textarea';
