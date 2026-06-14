"use client";

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";

type PanelProps = {
  className?: string;
  children: ReactNode;
};

export function EntityListPanel({ className = "", children }: PanelProps) {
  return <div className={`tp-entity-list-panel ${className}`.trim()}>{children}</div>;
}

type ToolbarProps = PanelProps;

export function EntityListToolbar({ className = "", children }: ToolbarProps) {
  return <div className={`tp-entity-list-toolbar ${className}`.trim()}>{children}</div>;
}

type SearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
};

export function EntityListSearch({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: SearchProps) {
  return (
    <label className={`tp-entity-list-search ${className}`.trim()}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden
        className="tp-entity-list-search__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="tp-entity-list-search__input"
      />
    </label>
  );
}

type ColumnsProps = {
  columns: string[];
  variant?: "three" | "five";
  className?: string;
};

export function EntityListColumns({ columns, variant = "three", className = "" }: ColumnsProps) {
  return (
    <div
      className={`tp-entity-list-columns tp-entity-list-columns--${variant} ${className}`.trim()}
      aria-hidden
    >
      {columns.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

type ListProps = {
  className?: string;
  children: ReactNode;
};

export function EntityList({ className = "", children }: ListProps) {
  return <ul className={`tp-entity-list ${className}`.trim()}>{children}</ul>;
}

type RowProps = {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
  onClick?: (event: MouseEvent<HTMLLIElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLLIElement>) => void;
  role?: string;
  tabIndex?: number;
  "aria-hidden"?: boolean;
  style?: CSSProperties;
};

export function EntityListRow({
  className = "",
  children,
  interactive = false,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  "aria-hidden": ariaHidden,
  style,
}: RowProps) {
  return (
    <li
      className={`tp-entity-list-row${interactive ? " tp-entity-list-row--interactive" : ""} ${className}`.trim()}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-hidden={ariaHidden}
      style={style}
    >
      {children}
    </li>
  );
}

type FooterProps = PanelProps;

export function EntityListFooter({ className = "", children }: FooterProps) {
  return <div className={`tp-entity-list-footer ${className}`.trim()}>{children}</div>;
}

export function EntityListPager({ className = "", children }: PanelProps) {
  return <div className={`tp-entity-list-footer__pager ${className}`.trim()}>{children}</div>;
}
