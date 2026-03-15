import { $markSchema, $inputRule, $remark } from "@milkdown/utils";
import { markRule } from "@milkdown/prose";
import { pandocMark } from "micromark-extension-mark";
import { pandocMarkFromMarkdown, pandocMarkToMarkdown } from "mdast-util-mark";

// remark プラグイン: micromark-extension-mark を使って ==text== を解析
function remarkMarkPlugin() {
  const self = this as any;
  const data = self.data();
  (data.micromarkExtensions ??= []).push(pandocMark());  // 呼び出し結果を登録
  (data.fromMarkdownExtensions ??= []).push(pandocMarkFromMarkdown);
}

export const remarkHighlight = $remark("highlight", () => remarkMarkPlugin);

// ProseMirror マークスキーマ
export const highlightSchema = $markSchema("mark", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", 0] as const,
  parseMarkdown: {
    match: (node: any) => node.type === "mark",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === "mark",
    runner: (state: any, mark: any) => {
      state.withMark(mark, "mark");
    },
  },
}));

// 入力規則: ==text== を入力すると即時変換
export const highlightInputRule = $inputRule((ctx) =>
  markRule(/==([^=]+)==$/, highlightSchema.type(ctx))
);

// remark-stringify 用ハンドラー（App.tsx の remarkStringifyOptionsCtx に追加する）
// バージョン違いの型競合を避けるため any でキャスト
export const highlightStringifyHandlers = pandocMarkToMarkdown.handlers as Record<string, any>;
