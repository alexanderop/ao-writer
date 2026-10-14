import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TooltipProvider } from '#/shared/ui/tooltip'

import appCss from '../styles.css?url'

/**
Runs before the first paint: puts the saved (or system) theme on <html> so a reload does not flash the wrong colours.
It reads the same localStorage entry as the settings atom.
*/
const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem('ao-writer:settings')||'null');var d=s?s.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'AO Writer' },
      { name: 'description', content: 'A quiet Markdown writer for the browser.' },
    ],
    links: [
      { rel: 'preload', href: `${import.meta.env.BASE_URL}fonts/iAWriterDuoS-Regular.woff2`, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
