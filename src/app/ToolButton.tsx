import type { ReactNode } from 'react'

import { Button } from '#/shared/ui/button'
import { Kbd } from '#/shared/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

interface ToolButtonProps {
  readonly label: string
  readonly shortcut?: string
  readonly pressed?: boolean
  readonly testId?: string
  /** Keep the text selection and focus in the editor when the button is pressed. */
  readonly keepFocus?: boolean
  readonly onClick?: () => void
  readonly children: ReactNode
}

/** An icon button with a tooltip that names the action and its shortcut. */
export function ToolButton({ label, shortcut, pressed, testId, keepFocus = false, onClick, children }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          data-testid={testId}
          onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="flex items-center gap-2">
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
