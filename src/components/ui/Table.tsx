import React from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  /** 10.2-C1 §3 — contextual fetch-error state. When set, the table keeps any
   * already-loaded rows visible (financial data is never blanked on a refresh
   * failure) and shows a non-destructive retry affordance instead. */
  error?: string | null;
  onRetry?: () => void;
  /** True while a retry is in flight. Preserves existing data; used for the
   * retry button's loading state and an accessible announcement. */
  isRetrying?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  isLoading = false,
  error = null,
  onRetry,
  isRetrying = false,
  emptyMessage = 'No records found',
  className = '',
}: TableProps<T>) {
  return (
    <div className={`overflow-x-auto w-full border border-outline-variant/30 rounded-lg bg-surface-container-lowest ${className}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant/30 text-outline uppercase tracking-wider font-semibold text-[11px]">
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{ width: col.width }}
                className={`py-3 px-4 ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                } ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-outline">
                <div className="flex items-center justify-center gap-2">
                  <Icon name="progress_activity" className="animate-spin text-[20px] text-primary" />
                  <span>Loading records...</span>
                </div>
              </td>
            </tr>
          ) : error ? (
            data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center">
                  <div className="flex flex-col items-center justify-center gap-3 px-4">
                    <Icon name="error_outline" className="text-[28px] text-error" />
                    <p role="status" className="text-xs text-outline max-w-sm">
                      {error}
                    </p>
                        <Button variant="primary" size="sm" onClick={onRetry} loading={isRetrying}>
                      {isRetrying ? 'Retrying…' : 'Try again'}
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {error && (
                  <tr>
                    <td colSpan={columns.length} className="py-3 px-4 bg-error-container/20">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-error">
                          <Icon name="error_outline" className="text-[18px]" />
                          {error}
                        </span>
                    <Button variant="primary" size="sm" onClick={onRetry} loading={isRetrying}>
                          {isRetrying ? 'Retrying…' : 'Try again'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {data.map((row, rowIdx) => (
                  <tr
                    key={keyExtractor(row, rowIdx)}
                    onClick={() => onRowClick?.(row)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-surface-container-low/70' : 'hover:bg-surface-container-low/40'
                    }`}
                  >
                    {columns.map((col, colIdx) => {
                      let content: React.ReactNode;
                      if (typeof col.accessor === 'function') {
                        content = col.accessor(row);
                      } else if (col.accessor) {
                        content = String((row as Record<string, unknown>)[col.accessor as string]);
                      } else {
                        content = null;
                      }

                      return (
                        <td
                          key={colIdx}
                          className={`py-3 px-4 text-on-surface ${
                            col.align === 'right'
                              ? 'text-right font-mono'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          } ${col.className || ''}`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            )
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-outline">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={keyExtractor(row, rowIdx)}
                onClick={() => onRowClick?.(row)}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-surface-container-low/70' : 'hover:bg-surface-container-low/40'
                }`}
              >
                {columns.map((col, colIdx) => {
                  let content: React.ReactNode;
                  if (typeof col.accessor === 'function') {
                    content = col.accessor(row);
                  } else if (col.accessor) {
                    content = String((row as Record<string, unknown>)[col.accessor as string]);
                  } else {
                    content = null;
                  }

                  return (
                    <td
                      key={colIdx}
                      className={`py-3 px-4 text-on-surface ${
                        col.align === 'right'
                          ? 'text-right font-mono'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}