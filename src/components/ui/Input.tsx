import React from "react";
import { Icon, type IconName } from "./Icon";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: IconName;
  rightElement?: React.ReactNode;
}

// Vertical margin utilities are hoisted off the <input> onto the positioning
// wrapper. The icon and action slots anchor with `inset-y-0`, so they centre on
// whatever box contains them; a top/bottom margin left on the input makes that
// box taller than the input's border box and pushes both slots high by half the
// margin. Spacing is visually identical either way, and the wrapper's border box
// now matches the input's, so the slots land on the input's true centre.
const VERTICAL_MARGIN = /(^|\s)(-?m[ybt]?)-(\S+)/g;

function splitVerticalMargin(className: string): { wrapper: string; input: string } {
  const wrapper: string[] = [];
  const input = className.replace(VERTICAL_MARGIN, (_m, lead, kind, size) => {
    wrapper.push(`${lead}${kind}-${size}`);
    return "";
  });
  return { wrapper: wrapper.join(" "), input: input.replace(/\s+/g, " ").trim() };
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, rightElement, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const spacing = splitVerticalMargin(className);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-on-surface mb-1.5">
            {label}
            {props.required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        {/* This wrapper is the positioning context for the icon and action slots,
            so it must be exactly the input's height. Vertical spacing is applied
            here (see splitVerticalMargin) to keep that true. */}
        <div className={`relative ${spacing.wrapper}`}>
          {icon && (
            // Full-height slot + flex centering. An absolutely positioned child is
            // out of flow, so the wrapper's `items-center` does not apply to it;
            // anchoring the slot to `inset-y-0` and centering inside it is what
            // keeps the glyph on the input's true vertical center. Avoids the
            // static-position drift that `absolute left-3` alone produced.
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline"
            >
              <Icon name={icon} className="text-[18px]" />
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full py-2 text-xs bg-surface-container-lowest border rounded-md text-on-surface placeholder:text-outline/70 transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
              icon ? 'pl-9' : 'pl-3'
            } ${rightElement ? 'pr-10' : 'pr-3'} ${
              error
                ? 'border-error focus:border-error focus:ring-error'
                : 'border-outline-variant/50 focus:border-primary'
            } disabled:bg-surface-container-low disabled:cursor-not-allowed ${spacing.input}`}
            {...props}
          />
          {rightElement && (
            // Same reasoning as the leading icon: anchor to the full input height
            // and center within it, rather than relying on the static position of
            // an out-of-flow box.
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">{rightElement}</div>
          )}
        </div>
        {error ? (
          <p className="text-[11px] text-error mt-1 flex items-center gap-1">
            <Icon name="error" className="text-[14px]" />
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[11px] text-outline mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';