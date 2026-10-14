import { createFileRoute } from '@tanstack/react-router'

import { App } from '#/app/App'

export const Route = createFileRoute('/')({
  // the app reads localStorage, OPFS and IndexedDB, so it only renders in the browser
  ssr: false,
  component: App,
})
