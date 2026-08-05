import { tokenizeLuaSource } from './lua-source-highlight'

export function LuaSourcePreview({ source }: { source: string }) {
  return (
    <pre aria-label="Generated Lua source">
      <code className="lua-source-preview-code">
        {tokenizeLuaSource(source).map((token, index) => token.kind === 'plain'
          ? token.text
          : <span className={`lua-token lua-token--${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>)}
      </code>
    </pre>
  )
}
