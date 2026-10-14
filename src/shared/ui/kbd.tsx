import { cn } from "cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-ink/10 px-1 font-sans text-xs font-medium text-ink-soft select-none",
        "[[data-slot=tooltip-content]_&]:bg-paper/20 [[data-slot=tooltip-content]_&]:text-paper",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
