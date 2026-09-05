import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { documentExtensions } from '@/lib/editor/extensions';

let cached: Schema | null = null;

/** The ProseMirror schema of a fiche's text, built once, on the server. */
export function documentSchema(): Schema {
  if (!cached) cached = getSchema(documentExtensions({ history: false }));
  return cached;
}
