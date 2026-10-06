"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { LookupInput, type LookupScope } from "./lookup-input";

export interface GlobalLookupProps extends LookupScope {
  placeholder?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  kinds?: Array<"player" | "team" | "page">;
  limit?: number;
  debounceMs?: number;
}
/** Navigation adapter; form fields use EntityPicker or EntityField. */
export function GlobalLookup({className = "", placeholder = "Search players, teams and pages (Press / to focus)", ...props}: GlobalLookupProps) {
  const router = useRouter(), params = useSearchParams();
  const [text,setText] = useState("");
  return <div className={className} role="search"><LookupInput {...props} label="Search players, teams and pages" placeholder={placeholder} value={text} onChange={setText} onSelect={item=>{setText(""); router.push(buildPreservedContextUrl(item.destination_url,params));}} onSubmitText={value=>{if(value.trim()) router.push(buildPreservedContextUrl(`/stats?name=${encodeURIComponent(value.trim())}`,params));}} /></div>;
}
