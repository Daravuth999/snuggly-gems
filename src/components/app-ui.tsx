import type { ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh app-safe-bottom">{children}</main>;
}

export function TopBar({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 glass app-safe-top px-5 pb-3">
      <div className="mx-auto grid max-w-lg grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="shrink-0">{left}</div>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-[11px] text-ink-400">{subtitle}</p>}
        </div>
        <div className="shrink-0 justify-self-end">{right}</div>
      </div>
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rise rounded-[var(--radius-app)] p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] ${className}`}>
      {children}
    </section>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  className?: string;
};

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "primary",
  className = "",
}: ButtonProps) {
  const base =
    "press w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold disabled:opacity-45 disabled:pointer-events-none";
  const styles = {
    primary:
      "text-white shadow-[0_14px_34px_-16px_oklch(0.72_0.16_295)] bg-[linear-gradient(120deg,oklch(0.62_0.19_295),oklch(0.66_0.15_240))]",
    outline: "border border-white/15 bg-white/5 text-ink-300",
    ghost: "text-ink-400",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  id,
  ...rest
}: { label: string; id: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="ml-1 text-[13px] font-medium text-ink-300">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        className="mt-1.5 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] outline-none transition focus:border-[oklch(0.72_0.16_295)] focus:bg-black/35"
      />
    </div>
  );
}

export function Banner({ tone, children }: { tone: "ok" | "bad" | "info"; children: ReactNode }) {
  const styles = {
    ok: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    bad: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    info: "border-white/10 bg-white/5 text-ink-300",
  }[tone];
  return (
    <p className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${styles}`}>{children}</p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[oklch(0.72_0.16_295)]" />
      {label}
    </div>
  );
}

export function Wave() {
  return (
    <div className="flex items-end justify-center gap-1.5" aria-hidden>
      {[10, 20, 32, 24, 14].map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-[linear-gradient(180deg,oklch(0.85_0.12_220),oklch(0.62_0.19_295))]"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}
