import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "default",
  className = "",
  ...rest
}) => {
  const sizeClass = size === "sm" ? "ui-btn--sm" : size === "lg" ? "ui-btn--lg" : "ui-btn--md";
  const variantClass =
    variant === "outline"
      ? "ui-btn--outline"
      : variant === "secondary"
        ? "ui-btn--secondary"
        : variant === "ghost"
          ? "ui-btn--ghost"
          : "ui-btn--default";
  return (
    <button className={`ui-btn ${sizeClass} ${variantClass} ${className}`} {...rest}>
      {children}
    </button>
  );
};
