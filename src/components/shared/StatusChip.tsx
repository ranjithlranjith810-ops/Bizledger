import React from "react";
import { Badge } from "@/components/ui/Badge";

export interface StatusChipProps {
  status: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const normalized = status.toLowerCase();

  if (['accepted', 'completed', 'paid', 'received', 'active', 'approved'].includes(normalized)) {
    return (
      <Badge variant="success" size="sm" icon="check_circle" className={className}>
        {status}
      </Badge>
    );
  }

  if (['sent', 'ordered', 'pending', 'in progress', 'partial'].includes(normalized)) {
    return (
      <Badge variant="warning" size="sm" icon="schedule" className={className}>
        {status}
      </Badge>
    );
  }

  if (['declined', 'cancelled', 'rejected', 'failed', 'expired'].includes(normalized)) {
    return (
      <Badge variant="error" size="sm" icon="cancel" className={className}>
        {status}
      </Badge>
    );
  }

  if (['draft', 'new'].includes(normalized)) {
    return (
      <Badge variant="neutral" size="sm" icon="edit_note" className={className}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" size="sm" className={className}>
      {status}
    </Badge>
  );
};