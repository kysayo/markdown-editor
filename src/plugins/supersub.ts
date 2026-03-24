import { $markSchema, $inputRule, $remark } from "@milkdown/utils";
import { markRule } from "@milkdown/prose";
import supersubPlugin from "remark-supersub";

// remark プラグイン: remark-supersub を使って ^text^ / ~text~ を解析
export const remarkSupersub = $remark("supersub", () => supersubPlugin as any);

// superscript マークスキーマ（^text^）
export const superscriptSchema = $markSchema("superscript", () => ({
  parseDOM: [{ tag: "sup" }],
  toDOM: () => ["sup", 0] as const,
  parseMarkdown: {
    match: (node: any) => node.type === "superscript",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === "superscript",
    runner: (state: any, mark: any) => {
      state.withMark(mark, "superscript");
    },
  },
}));

// subscript マークスキーマ（~text~）
export const subscriptSchema = $markSchema("subscript", () => ({
  parseDOM: [{ tag: "sub" }],
  toDOM: () => ["sub", 0] as const,
  parseMarkdown: {
    match: (node: any) => node.type === "subscript",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === "subscript",
    runner: (state: any, mark: any) => {
      state.withMark(mark, "subscript");
    },
  },
}));

// 入力規則: ^text^ を入力すると即時変換
export const superscriptInputRule = $inputRule((ctx) =>
  markRule(/\^([^^]+)\^$/, superscriptSchema.type(ctx))
);

// 入力規則: ~text~ を入力すると即時変換
export const subscriptInputRule = $inputRule((ctx) =>
  markRule(/~([^~]+)~$/, subscriptSchema.type(ctx))
);

// remark-stringify 用カスタムハンドラー（App.tsx の remarkStringifyOptionsCtx に追加する）
export const supersuperStringifyHandlers = {
  superscript: (node: any, _: any, context: any) => {
    const exit = context.enter("superscript");
    const value = (node.children ?? [])
      .map((c: any) => c.value ?? "")
      .join("");
    exit();
    return `^${value}^`;
  },
  subscript: (node: any, _: any, context: any) => {
    const exit = context.enter("subscript");
    const value = (node.children ?? [])
      .map((c: any) => c.value ?? "")
      .join("");
    exit();
    return `~${value}~`;
  },
};
