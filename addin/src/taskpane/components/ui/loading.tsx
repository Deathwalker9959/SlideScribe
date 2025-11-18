import React from "react";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  className?: string;
}

export function LoadingSpinner({ size = "md", message, className = "" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />
      {message && <p className="text-sm text-gray-600 text-center">{message}</p>}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({ isLoading, message, children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
          <LoadingSpinner message={message} />
        </div>
      )}
    </div>
  );
}

interface ProgressIndicatorProps {
  progress: number; // 0-100
  message?: string;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressIndicator({
  progress,
  message,
  showPercentage = true,
  className = "",
}: ProgressIndicatorProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${className}`}>
      {message && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">{message}</span>
          {showPercentage && (
            <span className="text-sm font-medium text-gray-900">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: "success" | "error" | "warning" | "info" | "loading";
  message: string;
  className?: string;
}

export function StatusBadge({ status, message, className = "" }: StatusBadgeProps) {
  const statusConfig = {
    success: {
      bgColor: "bg-green-100",
      textColor: "text-green-800",
      icon: CheckCircle,
      iconColor: "text-green-600",
    },
    error: {
      bgColor: "bg-red-100",
      textColor: "text-red-800",
      icon: AlertCircle,
      iconColor: "text-red-600",
    },
    warning: {
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
      icon: AlertCircle,
      iconColor: "text-yellow-600",
    },
    info: {
      bgColor: "bg-blue-100",
      textColor: "text-blue-800",
      icon: AlertCircle,
      iconColor: "text-blue-600",
    },
    loading: {
      bgColor: "bg-gray-100",
      textColor: "text-gray-800",
      icon: Loader2,
      iconColor: "text-gray-600",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor} ${config.textColor} ${className}`}
    >
      <Icon
        className={`w-4 h-4 ${status === "loading" ? "animate-spin" : ""} ${config.iconColor}`}
      />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  children?: React.ReactNode;
}

export function Skeleton({ className = "", children }: SkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-200 rounded h-4 w-full"></div>
      {children}
    </div>
  );
}

interface CardSkeletonProps {
  title?: boolean;
  subtitle?: boolean;
  lines?: number;
  className?: string;
}

export function CardSkeleton({
  title = true,
  subtitle = false,
  lines = 3,
  className = "",
}: CardSkeletonProps) {
  return (
    <div className={`p-4 border rounded-lg ${className}`}>
      {title && <div className="h-6 bg-gray-200 rounded mb-2 w-3/4"></div>}
      {subtitle && <div className="h-4 bg-gray-200 rounded mb-4 w-1/2"></div>}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-200 rounded mb-2 w-full"></div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {icon && <div className="mb-4 text-gray-400">{icon}</div>}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-600 mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  );
}
