import { $markSchema } from "@milkdown/utils";

// ProseMirror マークスキーマ（<u> タグとして描画）
export const underlineSchema = $markSchema("underline", () => ({
  parseDOM: [{ tag: "u" }],
  toDOM: () => ["u", 0] as const,
  parseMarkdown: {
    // Markdown 再ロード時の roundtrip は toMarkdown 側で担保。
    // remark は <u>text</u> を inline html として解析するため、
    // ここでは underline 型の mdast ノードのみマッチさせる（実質不使用）。
    match: (node: any) => node.type === "underline",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === "underline",
    runner: (state: any, mark: any) => {
      state.withMark(mark, "underline");
    },
  },
}));

// remark-stringify 用カスタムハンドラー（<u>text</u> として出力）
export const underlineStringifyHandlers = {
  underline: (node: any, _: any, context: any) => {
    const exit = context.enter("underline");
    const value = (node.children ?? []).map((c: any) => c.value ?? "").join("");
    exit();
    return `<u>${value}</u>`;
  },
};
