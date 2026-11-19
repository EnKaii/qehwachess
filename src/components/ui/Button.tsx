import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const CHAMFER = '[clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]';
const variantClasses: Record<Variant, string> = {
  primary: `bg-brand-500 hover:bg-brand-400 text-white transition-colors ${CHAMFER}`,
  secondary: 'bg-surface-900 hover:bg-surface-800 text-gray-200 border border-surface-700 hover:border-accent-400/70 hover:text-white transition-colors',
  ghost: 'bg-transparent hover:bg-white/5 text-gray-300 hover:text-white transition-colors',
  danger: 'bg-error-500/90 hover:bg-error-500 text-white transition-colors',
  outline: 'bg-transparent border border-accent-400/60 hover:border-accent-300 hover:bg-accent-400/10 text-brand-300 hover:text-white transition-colors',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs uppercase tracking-wider',
  md: 'px-5 py-2.5 text-xs uppercase tracking-wider',
  lg: 'px-7 py-3.5 text-sm uppercase tracking-wider',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
