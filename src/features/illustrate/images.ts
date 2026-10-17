import * as Atom from 'effect/reactivity/Atom'

/**
The pictures of the documents. They live in the browser next to the documents, in the OPFS subfolder `ao-writer/images`
(a subfolder, so the document listing that scans `ao-writer` never sees them). Where OPFS does not work, the session
keeps them in memory.
*/

const FOLDER = 'ao-writer'

const SUBFOLDER = 'images'

const memory = new Map<string, Blob>()

async function imageFolder(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  const folder = await root.getDirectoryHandle(FOLDER, { create: true })

  return folder.getDirectoryHandle(SUBFOLDER, { create: true })
}

/** Counts the pictures written so far, so a preview that showed a placeholder for one knows to look again. */
export const imagesVersionAtom = Atom.make(0).pipe(Atom.keepAlive)

/** The file name behind an `images/<id>.webp` path from the text, or null for any other source. */
export function imageName(src: string): string | null {
  return /^images\/([\w-]+\.webp)$/.exec(src)?.[1] ?? null
}

/** Keeps a picture under its file name; in memory at least, and in OPFS where that works. */
export async function writeImage(name: string, blob: Blob): Promise<void> {
  memory.set(name, blob)

  try {
    const handle = await (await imageFolder()).getFileHandle(name, { create: true })
    const writable = await handle.createWritable()

    await writable.write(blob)
    await writable.close()
  } catch {
    // no OPFS here: the picture lives for this session
  }
}

/** A stored picture, or null when there is none under that name. */
export async function readImage(name: string): Promise<Blob | null> {
  const kept = memory.get(name)

  if (kept) return kept

  try {
    const handle = await (await imageFolder()).getFileHandle(name)

    return await handle.getFile()
  } catch {
    return null
  }
}

/** Turns the base64 PNG Codex made into a smaller WebP. */
export async function pngToWebp(base64: string): Promise<Blob> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)

  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()

  return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
}
