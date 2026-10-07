export type MarkdownBlock = { kind: "heading" | "paragraph" | "list" | "code"; text: string; level?: number };
// Deliberately bounded original-content dialect: no HTML, remote images or scripts.
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines=source.replaceAll("\r\n","\n").split("\n");
  const blocks:MarkdownBlock[]=[];
  let i=0;
  while(i<lines.length) {
    const line=lines[i++];
    if(!line.trim()) continue;
    if(line.startsWith("```")) {const code:string[]=[];while(i<lines.length&&!lines[i].startsWith("```"))code.push(lines[i++]);i++;blocks.push({kind:"code",text:code.join("\n")});continue;}
    const heading=/^(#{1,3}) (.+)$/.exec(line);
    if(heading){blocks.push({kind:"heading",level:heading[1].length,text:heading[2]});continue;}
    if(line.startsWith("- ")){const list=[line.slice(2)];while(i<lines.length&&lines[i].startsWith("- "))list.push(lines[i++].slice(2));blocks.push({kind:"list",text:list.join("\n")});continue;}
    const paragraph=[line];while(i<lines.length&&lines[i].trim()&&!/^(#|- |```)/.test(lines[i]))paragraph.push(lines[i++]);blocks.push({kind:"paragraph",text:paragraph.join(" ")});
  }
  return blocks;
}
export function localContentUrl(url: string): string | null {
  return url.startsWith("/") && !url.startsWith("//") && !/[\\\s\u0000-\u001f]/.test(url) ? url : null;
}

export type PositionedMarkdownBlock = MarkdownBlock & { positions: number[] };
/** Code-point offsets match Python provenance, including emoji and CRLF input. */
export function parsePositionedMarkdown(source: string): PositionedMarkdownBlock[] {
  const characters = Array.from(source);
  const lines: { text: string; positions: number[]; start: number }[] = [];
  let start = 0;
  for (let i = 0; i <= characters.length; i++) {
    if (i < characters.length && characters[i] !== "\n") continue;
    const end = characters[i - 1] === "\r" ? i - 1 : i;
    lines.push({ text: characters.slice(start, end).join(""), positions: Array.from({ length: end - start }, (_, n) => start + n), start });
    start = i + 1;
  }
  const blocks: PositionedMarkdownBlock[] = [];
  let i = 0;
  function joined(kind: MarkdownBlock["kind"], parts: typeof lines, separator: string) {
    const text = parts.map(part => part.text).join(separator);
    const positions = parts.flatMap((part, n) => n ? [part.start - 1, ...part.positions] : part.positions);
    blocks.push({ kind, text, positions });
  }
  while (i < lines.length) {
    const line = lines[i++];
    if (!line.text.trim()) continue;
    if (line.text.startsWith("```")) {
      const parts = [];
      while (i < lines.length && !lines[i].text.startsWith("```")) parts.push(lines[i++]);
      i++; joined("code", parts, "\n"); continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line.text);
    if (heading) { blocks.push({ kind: "heading", level: heading[1].length, text: heading[2], positions: line.positions.slice(heading[1].length + 1) }); continue; }
    if (line.text.startsWith("- ")) {
      const parts = [{ text: line.text.slice(2), positions: line.positions.slice(2), start: line.start + 2 }];
      while (i < lines.length && lines[i].text.startsWith("- ")) {
        const item = lines[i++]; parts.push({ text: item.text.slice(2), positions: item.positions.slice(2), start: item.start + 2 });
      }
      joined("list", parts, "\n"); continue;
    }
    const parts = [line];
    while (i < lines.length && lines[i].text.trim() && !/^(#|- |```)/.test(lines[i].text)) parts.push(lines[i++]);
    joined("paragraph", parts, " ");
  }
  return blocks;
}
