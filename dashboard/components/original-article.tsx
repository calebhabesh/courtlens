import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { localContentUrl, parseMarkdown, type MarkdownBlock } from "@/lib/markdown";
import { ArticleLayout, ArticleSection } from "./ui/article-layout";

function Inline({text}:{text:string}) {
  const tokens=text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return <>{tokens.map((token,i)=>{
    const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if(link){const url=localContentUrl(link[2]);return url ? <Link key={i} href={url}>{link[1]}</Link> : <span key={i}>{link[1]}</span>;}
    if(token.startsWith("`"))return <code key={i}>{token.slice(1,-1)}</code>;
    if(token.startsWith("**"))return <strong key={i}>{token.slice(2,-2)}</strong>;
    // One date display format (D11): calendar dates in prose read "Oct 4, 2026".
    return token.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date=>formatDate(date));
  })}</>;
}

function Block({block}:{block:MarkdownBlock}) {
  if(block.kind==="heading")return <h3><Inline text={block.text} /></h3>;
  if(block.kind==="code")return <pre><code>{block.text}</code></pre>;
  if(block.kind==="list")return <ul>{block.text.split("\n").map((line,j)=><li key={j}><Inline text={line} /></li>)}</ul>;
  return <p><Inline text={block.text} /></p>;
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

export interface ArticleSectionSource { id: string; title: string; blocks: MarkdownBlock[] }

/**
 * Splits original content into Article template sections: the level-1 heading and the lines
 * before the first level-2 heading lead the article; each level-2 heading starts a section.
 */
export function articleSections(source: string): ArticleSectionSource[] {
  const sections: ArticleSectionSource[] = [];
  const add = (title: string) => {
    let id = slug(title);
    for (let n = 2; sections.some(section => section.id === id); n++) id = `${slug(title)}-${n}`;
    sections.push({ id, title, blocks: [] });
  };
  for (const block of parseMarkdown(source)) {
    const level = block.kind === "heading" ? block.level : undefined;
    if ((level === 1 && !sections.length) || level === 2) { add(block.text); continue; }
    if (!sections.length) add("Overview");
    sections.at(-1)!.blocks.push(block);
  }
  return sections;
}

export function OriginalArticle({source}:{source:string}) {
  const sections = articleSections(source);
  return <ArticleLayout className="original-article" toc={sections.map(section => ({ id: section.id, label: section.title }))}>
    {sections.map((section, index) => (
      <ArticleSection key={section.id} id={section.id} title={<Inline text={section.title} />} className={index === 0 ? "original-article-lead" : ""}>
        {section.blocks.map((block, i) => <Block key={i} block={block} />)}
      </ArticleSection>
    ))}
  </ArticleLayout>;
}
