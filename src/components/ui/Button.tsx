import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-md transition-all duration-150 select-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'px-2.5 py-1 text-xs gap-1.5 min-h-[30px]',
    md: 'px-3.5 py-1.5 text-xs gap-2 min-h-[36px]',
    lg: 'px-5 py-2.5 text-sm gap-2.5 min-h-[42px]',
  };

  const variantStyles = {
    primary: 'bg-primary text-on-primary hover:bg-primary-container active:scale-[0.98] shadow-sm',
    secondary: 'bg-secondary text-on-secondary hover:bg-secondary/90 active:scale-[0.98]',
    outline: 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low active:bg-surface-container',
    ghost: 'text-secondary hover:text-on-surface hover:bg-surface-container-low',
    danger: 'bg-error text-on-error hover:bg-error/90 active:scale-[0.98]',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon && iconPosition === 'left' ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}

      {children && <span>{children}</span>}

      {!loading && icon && iconPosition === 'right' && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
    </button>
  );
};