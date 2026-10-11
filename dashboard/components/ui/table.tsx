import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { Icon } from "./icon";
import { Skeleton } from "./skeleton";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  stickyHeader?: boolean;
  density?: "default" | "compact";
  containerClassName?: string;
}

export function Table({
  stickyHeader = false,
  density = "default",
  containerClassName = "",
  className = "",
  children,
  ...props
}: TableProps) {
  return (
    <div
      className={`ui-table-container ${stickyHeader ? "ui-table-sticky" : ""} ${density === "compact" ? "ui-table-compact" : ""} ${containerClassName}`}
    >
      <table className={`ui-table ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`ui-table-header ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`ui-table-body ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  hoverable?: boolean;
}

export function TableRow({
  selected = false,
  hoverable = true,
  className = "",
  children,
  ...props
}: TableRowProps) {
  return (
    <tr
      data-selected={selected}
      className={`ui-table-row ${hoverable ? "ui-table-row-hoverable" : ""} ${selected ? "ui-table-row-selected" : ""} ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
}

export function TableHead({
  align = "left",
  className = "",
  children,
  ...props
}: TableHeadProps) {
  return (
    <th
      scope="col"
      className={`ui-table-head ui-table-align-${align} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  numeric?: boolean;
}

export function TableCell({
  align = "left",
  numeric = false,
  className = "",
  children,
  ...props
}: TableCellProps) {
  const resolvedAlign = numeric ? "right" : align;
  return (
    <td
      className={`ui-table-cell ui-table-align-${resolvedAlign} ${numeric ? "tabular-nums" : ""} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export interface SortHeaderProps extends TableHeadProps {
  sortDirection?: "asc" | "desc" | null;
  onToggleSort?: () => void;
}

export function SortHeader({
  sortDirection = null,
  onToggleSort,
  children,
  className = "",
  ...props
}: SortHeaderProps) {
  const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none";

  return (
    <TableHead
      aria-sort={ariaSort}
      className={`ui-table-sort-head ${className}`}
      {...props}
    >
      {onToggleSort ? (
        <button
          type="button"
          onClick={onToggleSort}
          className="ui-table-sort-button"
        >
          <span>{children}</span>
          <span
            className={`ui-table-sort-icon ${sortDirection ? `ui-table-sort-${sortDirection}` : "ui-table-sort-inactive"}`}
            aria-hidden="true"
          >
            {sortDirection === "asc" ? (
              <Icon name="up" size={14} />
            ) : sortDirection === "desc" ? (
              <Icon name="down" size={14} />
            ) : (
              <Icon name="chevron-down" size={14} />
            )}
          </span>
        </button>
      ) : (
        children
      )}
    </TableHead>
  );
}

export interface TableSkeletonRowProps {
  columns: number;
}

export function TableSkeletonRow({ columns }: TableSkeletonRowProps) {
  return (
    <TableRow hoverable={false}>
      {Array.from({ length: columns }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton height={16} width={i === 0 ? "75%" : "50%"} />
        </TableCell>
      ))}
    </TableRow>
  );
}
