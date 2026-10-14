import * as KeyValueStore from 'effect/persistence/KeyValueStore'
import * as Atom from 'effect/reactivity/Atom'

import { defaultSettings, Settings } from './settings.ts'

/** The key the page's inline script also reads, so the theme is right before React starts. */
const SETTINGS_KEY = 'margin:settings'

/** Browser storage as a key-value store; the app route is client-only, so this only runs in the browser. */
const storage = Atom.runtime(KeyValueStore.layerStorage(() => localStorage))

/** The writer's settings, kept in localStorage. */
export const settingsAtom = Atom.kvs({
  runtime: storage,
  key: SETTINGS_KEY,
  schema: Settings,
  defaultValue: () => defaultSettings(window.matchMedia('(prefers-color-scheme: dark)').matches),
}).pipe(Atom.keepAlive)
