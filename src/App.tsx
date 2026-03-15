import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import "./App.css";

const initialMarkdown = `# はじめに

ここに **Markdown** を書いてください。

- リスト項目1
- リスト項目2

> 引用テキスト

\`\`\`
コードブロック
\`\`\`
`;

function MilkdownEditor() {
  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialMarkdown);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
  );

  return <Milkdown />;
}

function App() {
  return (
    <MilkdownProvider>
      <div className="milkdown-editor-wrapper">
        <MilkdownEditor />
      </div>
    </MilkdownProvider>
  );
}

export default App;
