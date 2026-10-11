import React from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { ChartData, ChartFrame, type ChartMeta } from "./chart-frame";
import { CATEGORIES, chartVars, nonnegative, numberLabel, toneColor, type ChartTone } from "./semantics";

export interface FlowNode { id: string; label: string; tone?: ChartTone }
export interface FlowLink { source: string; target: string; value: number | null }
export interface SankeyProps extends ChartMeta { nodes: FlowNode[]; links: FlowLink[]; format?: (value: number) => string }

/** Validate before d3's mutable layout; a malformed/cyclic graph is a recoverable UI state. */
export function validFlow(nodes: FlowNode[], links: FlowLink[]): boolean {
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length || links.some(link => !ids.has(link.source) || !ids.has(link.target) || (typeof link.value === "number" && (!Number.isFinite(link.value) || link.value < 0)))) return false;
  const degree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const link of links) {
    degree.set(link.target, degree.get(link.target)! + 1);
    outgoing.get(link.source)!.push(link.target);
  }
  const queue = nodes.filter(node => degree.get(node.id) === 0).map(node => node.id);
  for (let i = 0; i < queue.length; i++) for (const target of outgoing.get(queue[i])!) {
    degree.set(target, degree.get(target)! - 1);
    if (degree.get(target) === 0) queue.push(target);
  }
  return queue.length === nodes.length;
}

export function Sankey({ nodes, links, format = numberLabel, ...meta }: SankeyProps) {
  const valid = validFlow(nodes, links);
  const observedLinks = links.filter(link => nonnegative(link.value) && link.value > 0);
  const activeIds = new Set(observedLinks.flatMap(link => [link.source, link.target]));
  const graph = valid && observedLinks.length > 0 ? sankey<FlowNode, FlowLink>().nodeId(node => node.id).nodeWidth(16).nodePadding(16).extent([[8, 16], [792, 296]])({
    nodes: nodes.filter(node => activeIds.has(node.id)).map(node => ({ ...node })),
    links: observedLinks.map(link => ({ ...link, value: link.value! }))
  }) : null;
  const color = (node: FlowNode) => toneColor(node.tone ?? `category-${CATEGORIES[nodes.findIndex(n => n.id === node.id) % CATEGORIES.length]}`);
  const nodeName = (id: string) => nodes.find(node => node.id === id)?.label ?? id;
  const layers = graph ? [...new Set(graph.nodes.map(node => node.depth!))].sort((a, b) => a - b) : [];
  return <ChartFrame {...meta} state={meta.state ?? (!valid ? "error" : links.length === 0 ? "empty" : "ready")}>
    <ChartData fingerprint={JSON.stringify([nodes, links])}>
      {graph && <>
        <svg className="chart-graphic chart-flow-desktop" viewBox="0 0 800 320" role="img" aria-label={`${meta.title}; flow widths show known amounts; exact values in the flow table`}>
          {graph.links.map((link, index) => <path key={index} d={sankeyLinkHorizontal()(link) ?? ""} fill="none" stroke={color(link.source as FlowNode)} strokeWidth={Math.max(1, link.width!)} opacity="0.45"><title>{`${(link.source as FlowNode).label} to ${(link.target as FlowNode).label}: ${format(link.value)}`}</title></path>)}
          {graph.nodes.map(node => <g key={node.id}><rect x={node.x0} y={node.y0} width={node.x1! - node.x0!} height={node.y1! - node.y0!} fill={color(node)} />
            <text className="chart-svg-label" x={node.x0! < 400 ? node.x1! + 8 : node.x0! - 8} y={(node.y0! + node.y1!) / 2} textAnchor={node.x0! < 400 ? "start" : "end"}>{node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}</text><title>{`${node.label}: ${format(node.value!)}`}</title></g>)}
        </svg>
        <div className="chart-flow-phone" role="group" aria-label="Flow by stage">{layers.map(depth => {
          const layer = graph.nodes.filter(node => node.depth === depth);
          const total = layer.reduce((sum, node) => sum + node.value!, 0);
          return <div key={depth}><h4>Stage {depth + 1} · known {format(total)}</h4>
            <svg className="chart-graphic chart-bar" viewBox="0 0 100 16" role="img" aria-label={`Stage ${depth + 1} shares of known total`}>
              {layer.map((node, index) => <rect key={node.id} x={layer.slice(0, index).reduce((sum, n) => sum + n.value!, 0) / total * 100} width={node.value! / total * 100} height="16" fill={color(node)}><title>{`${node.label}: ${format(node.value!)}`}</title></rect>)}
            </svg><ul className="chart-legend">{layer.map(node => <li key={node.id}><span className="chart-key" style={chartVars({ "--chart-tone": color(node) })} aria-hidden="true" /><span>{node.label}</span><strong>{format(node.value!)}</strong></li>)}</ul></div>;
        })}</div>
      </>}
      {!graph && <p className="chart-note">No positive observed flow to draw.</p>}
      <div className="chart-table-scroll" role="region" aria-label="Exact flow values" tabIndex={0}><table className="chart-table"><caption>Known flow; missing amounts stay unknown</caption><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Amount</th></tr></thead><tbody>{links.map((link, i) => <tr key={i}><td>{nodeName(link.source)}</td><td>{nodeName(link.target)}</td><td className="num">{nonnegative(link.value) ? format(link.value) : "Unknown"}</td></tr>)}</tbody></table></div>
    </ChartData>
  </ChartFrame>;
}
