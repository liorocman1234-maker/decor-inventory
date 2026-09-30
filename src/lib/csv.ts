/** Parses CSV, or cells pasted from Excel (tab-separated). The delimiter is detected from the first line. */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const delimiter = ['\t', ';', ','].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ',')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') cell += text[++i]
      else quoted = false
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const count = (text: string, ch: string) => text.split(ch).length - 1

/** Excel in Hebrew often saves CSV as Windows-1255 rather than UTF-8. */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1255').decode(buffer)
  }
}
