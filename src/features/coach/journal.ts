/// <reference types="node" />
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { addWord, formatVocabulary, parseVocabulary } from '../../core/coach/vocabulary.ts'
import type { LearnedWord } from '../../core/coach/vocabulary.ts'

/**
The coach's journal: two Markdown files the writer can open and edit themselves.
They live outside the browser, so they follow the writer across documents and browsers; AO_WRITER_COACH_DIR moves them.
*/
export const journalDirectory = process.env.AO_WRITER_COACH_DIR ?? join(homedir(), '.ao-writer')

const VOCABULARY_FILE = join(journalDirectory, 'vocabulary.md')

const PROFILE_FILE = join(journalDirectory, 'coach-profile.md')

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

/** Writes through a temporary file, so a crash never leaves half a journal. */
async function writeText(path: string, text: string): Promise<void> {
  await mkdir(journalDirectory, { recursive: true })
  await writeFile(`${path}.tmp`, text, 'utf8')
  await rename(`${path}.tmp`, path)
}

export async function readVocabulary(): Promise<LearnedWord[]> {
  return parseVocabulary(await readText(VOCABULARY_FILE))
}

export async function learnWord(entry: LearnedWord): Promise<LearnedWord[]> {
  const words = addWord(await readVocabulary(), entry)

  await writeText(VOCABULARY_FILE, formatVocabulary(words))

  return words
}

export async function readProfile(): Promise<string> {
  return (await readText(PROFILE_FILE)).trim()
}

export async function writeProfile(profile: string): Promise<void> {
  await writeText(PROFILE_FILE, `${profile.trim()}\n`)
}
