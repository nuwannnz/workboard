import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { markdownExtensions } from './markdown-editor';

/**
 * Markdown round-trip (FR-004, research §3): mounting a headless editor with Markdown input
 * renders it into the WYSIWYG document, and serializing back yields equivalent Markdown for the
 * formatting the spec names — headings, bold/italic, bullet & numbered lists, and links. This
 * exercises the exact extension set the `MarkdownEditor` component uses, without depending on
 * ProseMirror's contentEditable selection in jsdom.
 */
function roundTrip(markdown: string): string {
  const editor = new Editor({ extensions: markdownExtensions, content: markdown });
  const out = editor.storage.markdown.getMarkdown();
  editor.destroy();
  return out.trim();
}

describe('markdown-editor round-trip (markdownExtensions)', () => {
  it('preserves a heading', () => {
    expect(roundTrip('# Title')).toBe('# Title');
  });

  it('preserves bold and italic', () => {
    expect(roundTrip('**bold** and *italic*')).toBe('**bold** and *italic*');
  });

  it('preserves a bullet list', () => {
    const out = roundTrip('- one\n- two');
    expect(out).toContain('- one');
    expect(out).toContain('- two');
  });

  it('preserves a numbered list', () => {
    const out = roundTrip('1. first\n2. second');
    expect(out).toContain('1. first');
    expect(out).toContain('2. second');
  });

  it('preserves a link', () => {
    expect(roundTrip('[WorkBoard](https://example.com)')).toBe('[WorkBoard](https://example.com)');
  });

  it('renders the parsed document as WYSIWYG nodes (not raw text)', () => {
    const editor = new Editor({ extensions: markdownExtensions, content: '# Heading\n\n**bold**' });
    const html = editor.getHTML();
    editor.destroy();
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>');
  });
});
