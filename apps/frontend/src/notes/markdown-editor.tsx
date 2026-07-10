import { useEffect } from 'react';
import { useEditor, EditorContent, type Extensions } from '@tiptap/react';
import { InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

/**
 * Link, extended with a live input rule so typing Markdown link syntax `[text](url)` converts
 * to a real link **as you type** (StarterKit/Link give no such rule; only bare URLs autolink).
 * Fires only on typing — content parsing/serialization is unchanged, so the round-trip is
 * unaffected.
 */
const LinkWithInputRule = Link.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^\s)]+)\)$/,
        handler: ({ range, match, chain }) => {
          const [, text, href] = match;
          const from = range.from;
          chain()
            .insertContentAt({ from: range.from, to: range.to }, text)
            .setTextSelection({ from, to: from + text.length })
            .setLink({ href })
            .setTextSelection(from + text.length)
            .unsetMark('link')
            .run();
        },
      }),
    ];
  },
});

export interface MarkdownEditorProps {
  /** The note body as **Markdown** — the stored source of truth (research §3). */
  value: string;
  /** Emits equivalent Markdown whenever the document changes. */
  onChange: (markdown: string) => void;
  placeholder?: string;
}

/**
 * The editor extensions. StarterKit covers the formatting FR-004 names — headings, bold/italic,
 * bullet & numbered lists — and `tiptap-markdown` serializes the document to/from Markdown (with
 * links) so the persisted value is always a plain Markdown string. Exported so the round-trip is
 * unit-testable with a headless editor (Principle III). The Placeholder extension is layered on
 * per-instance in the component (it carries the placeholder text and doesn't affect serialization).
 */
export const markdownExtensions: Extensions = [
  StarterKit,
  LinkWithInputRule.configure({ openOnClick: false }),
  Markdown.configure({ html: false, linkify: true, transformPastedText: true }),
];

/**
 * WYSIWYG Markdown editor (contracts §Editor, research §3): a headless TipTap editor whose
 * `value`/`onChange` are **Markdown**. Formatting renders **as you type** (typing `# ` becomes a
 * heading, `**x**` becomes bold, `- ` a list) via StarterKit's input rules, styled by the
 * `.note-content` rules in styles.css. The document is serialized back to Markdown on every
 * change so the note's stored body stays a Markdown string. It fills its container for an
 * immersive, borderless writing surface (no text-box chrome).
 */
export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      ...markdownExtensions,
      Placeholder.configure({ placeholder: placeholder ?? 'Write your note…' }),
    ],
    content: value,
    editorProps: {
      attributes: {
        'aria-label': 'Note content',
        'data-testid': 'markdown-editor-surface',
        class: 'note-content min-h-full',
      },
    },
    onUpdate({ editor }) {
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  // Re-seat the editor when the selected note changes externally (not mid-typing).
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (!editor.isFocused && value !== current) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  return (
    <EditorContent
      editor={editor}
      data-testid="markdown-editor"
      className="min-h-0 flex-1 cursor-text"
      onClick={() => editor?.chain().focus().run()}
    />
  );
}
