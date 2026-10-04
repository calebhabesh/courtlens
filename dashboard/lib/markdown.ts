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
