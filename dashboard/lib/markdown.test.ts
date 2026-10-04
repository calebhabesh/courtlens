import { expect, it } from "vitest";
import { localContentUrl, parseMarkdown } from "./markdown";
it("original content keeps code literal and supports bounded Markdown",()=>{
  expect(parseMarkdown("# Original\n\nA paragraph\ncontinues.\n\n```python\n<script>literal</script>\n```\n\n- First\n- Second")).toEqual([{kind:"heading",level:1,text:"Original"},{kind:"paragraph",text:"A paragraph continues."},{kind:"code",text:"<script>literal</script>"},{kind:"list",text:"First\nSecond"}]);
});
it("only local content links are navigable",()=>{
  expect(localContentUrl("/research/ask?season=2024-25")).toBe("/research/ask?season=2024-25");
  for(const url of ["javascript:alert(1)","https://outside.example","//outside.example","/\\outside.example","/\nunsafe"])expect(localContentUrl(url)).toBeNull();
});
