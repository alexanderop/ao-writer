import * as Atom from 'effect/reactivity/Atom'

import { emptyLearning, Learning } from '../../core/learn/practice.ts'
import { browserStorage } from '../settings/atoms.ts'

/** The practice book is independent of the server journal, so reviews also work offline. */
export const learningAtom = Atom.kvs({
  runtime: browserStorage, key: 'ao-writer:learning:v1', schema: Learning, defaultValue: () => emptyLearning,
}).pipe(Atom.keepAlive)

export const learningOpenAtom = Atom.make(false).pipe(Atom.keepAlive)
