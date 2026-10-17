import { useAtom } from '@effect/atom-react'
import { useEffect } from 'react'

import { illustrateStatusAtom } from '../features/illustrate/atoms.ts'

/** A failure message stays this long, then goes by itself. */
const MESSAGE_MS = 8_000

/** Quiet feedback for Illustrate, beside the coach's dot: a pulse while Codex draws, a short line when it did not work out. */
export function IllustrateDot() {
  const [status, setStatus] = useAtom(illustrateStatusAtom)

  useEffect(() => {
    if (status.kind !== 'failed') return

    const timer = setTimeout(() => setStatus({ kind: 'idle' }), MESSAGE_MS)

    return () => clearTimeout(timer)
  }, [status, setStatus])

  if (status.kind === 'idle') return null

  const title = status.kind === 'running' ? (status.count === 1 ? 'Codex is drawing a picture' : `Codex is drawing ${status.count} pictures`) : status.message

  return (
    <>
      <button
        type="button"
        className="coach-dot absolute top-14 right-11 z-10 grid size-6 place-items-center rounded-full"
        data-state={status.kind === 'running' ? 'thinking' : 'offline'}
        data-testid="illustrate-dot"
        title={title}
        aria-label={title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setStatus({ kind: 'idle' })}
      >
        <span />
      </button>
      {status.kind === 'failed' ? (
        <p className="absolute top-[5.25rem] right-5 z-10 max-w-72 text-right text-xs text-ink-faint" role="status" data-testid="illustrate-message">
          {status.message}
        </p>
      ) : null}
    </>
  )
}
