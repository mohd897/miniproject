import React from 'react';
import { cn } from './Card';

export const Button = React.forwardRef(({ className, variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
  const Comp = asChild ? "span" : "button"; // Simple asChild implementation

  const variants = {
    default: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20",
    destructive: "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20",
    outline: "border border-white/20 bg-transparent hover:bg-white/10 text-white",
    secondary: "bg-gray-800 text-white hover:bg-gray-700",
    ghost: "hover:bg-white/10 text-white",
    link: "text-indigo-400 underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };

  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";
