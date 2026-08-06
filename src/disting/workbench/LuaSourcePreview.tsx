import { tokenizeLuaSource } from './lua-source-highlight'

export function LuaSourcePreview({ source, activeLine }: { source: string; activeLine?: number }) {
  const lines = source.split('\n')
  return (
    <pre aria-label="Generated Lua source">
      <code className="lua-source-preview-code">
        {lines.map((line, lineIndex) => <span
          className="lua-source-preview-line"
          aria-current={activeLine === lineIndex + 1 ? 'true' : undefined}
          data-source-line={lineIndex + 1}
          key={lineIndex}
        >{tokenizeLuaSource(line).map((token, tokenIndex) => token.kind === 'plain'
            ? token.text
            : <span className={`lua-token lua-token--${token.kind}`} key={`${tokenIndex}-${token.kind}`}>{token.text}</span>)}{lineIndex < lines.length - 1 ? '\n' : ''}</span>)}
      </code>
    </pre>
  )
}
