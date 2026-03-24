declare module 'mdast-util-mark' {
  import type { FromMarkdownExtension } from 'mdast-util-from-markdown';
  export const pandocMarkFromMarkdown: FromMarkdownExtension;
  export const pandocMarkToMarkdown: { handlers: Record<string, any> };
}
