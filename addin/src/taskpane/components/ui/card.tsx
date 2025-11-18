import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = "", ...rest }) => {
  return (
    <div className={`ui-card ${className}`} {...rest}>
      {children}
    </div>
  );
};

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = "", ...rest }) => {
  return (
    <div className={`ui-card-header ${className}`} {...rest}>
      {children}
    </div>
  );
};

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: React.ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, className = "", ...rest }) => {
  return (
    <h3 className={`ui-card-title ${className}`} {...rest}>
      {children}
    </h3>
  );
};

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({
  children,
  className = "",
  ...rest
}) => {
  return (
    <p className={`ui-card-description ${className}`} {...rest}>
      {children}
    </p>
  );
};

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className = "", ...rest }) => {
  return (
    <div className={`ui-card-content ${className}`} {...rest}>
      {children}
    </div>
  );
};
