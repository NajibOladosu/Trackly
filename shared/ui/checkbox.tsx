"use client"

import { Check, Minus } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  indeterminate?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
  onClick?: (e: React.MouseEvent) => void
}

export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  className,
  onClick,
  ...props
}: CheckboxProps) {
  const active = checked || indeterminate

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={props["aria-label"]}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        if (!disabled) onChange(!checked)
      }}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-zinc-600 bg-zinc-900 hover:border-primary/60",
        className
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  )
}
