import React from "react";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "../ui/Icon";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`p-12 text-center flex flex-col items-center justify-center bg-surface-container-lowest border border-dashed border-outline-variant/60 rounded-xl ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline mb-4">
        <Icon name={icon} className="text-[28px]" />
      </div>
      <h3 className="text-sm font-semibold text-on-surface mb-1">{title}</h3>
      <p className="text-xs text-outline max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} icon="add">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};