import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-bold uppercase tracking-widest transition-[opacity,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/60",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent/85",
        secondary: "bg-transparent text-fg border border-border hover:bg-elevated",
        ghost: "text-muted hover:text-fg hover:bg-elevated",
        outline: "border border-border text-fg hover:bg-elevated",
        steel: "bg-fg/15 text-fg border border-border hover:bg-fg/25",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[10px]",
        lg: "h-11 px-5",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
