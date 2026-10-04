import Link from "next/link";
import { localContentUrl, parseMarkdown } from "@/lib/markdown";
function Inline({text}:{text:string}) {
  const tokens=text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return <>{tokens.map((token,i)=>{
    const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if(link){const url=localContentUrl(link[2]);return url ? <Link key={i} href={url}>{link[1]}</Link> : <span key={i}>{link[1]}</span>;}
    if(token.startsWith("`"))return <code key={i}>{token.slice(1,-1)}</code>;
    if(token.startsWith("**"))return <strong key={i}>{token.slice(2,-2)}</strong>;
    return token;
  })}</>;
}
export function OriginalArticle({source}:{source:string}) {
  return <article className="original-article">{parseMarkdown(source).map((block,i)=>{
    const text=<Inline text={block.text} />;
    if(block.kind==="heading")return block.level===1 ? <h1 key={i}>{text}</h1> : block.level===2 ? <h2 key={i}>{text}</h2> : <h3 key={i}>{text}</h3>;
    if(block.kind==="code")return <pre key={i}><code>{block.text}</code></pre>;
    if(block.kind==="list")return <ul key={i}>{block.text.split("\n").map((line,j)=><li key={j}><Inline text={line} /></li>)}</ul>;
    return <p key={i}>{text}</p>;
  })}</article>;
}
