import { cn } from "@/lib/utils";

export function Panel({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]", className)} {...p} />;
}

export function Button({ className, variant = "default", ...p }:
  React.ComponentProps<"button"> & { variant?: "default" | "ghost" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-[var(--color-accent)] text-black hover:opacity-90",
        variant === "ghost" && "border border-[var(--color-line)] text-[var(--color-ink)] hover:bg-white/5",
        variant === "danger" && "border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10",
        className,
      )}
      {...p}
    />
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  "in-sync": { label: "In sync", cls: "border-[var(--color-accent)]/40 text-[var(--color-accent)]" },
  "behind": { label: "Behind cloud", cls: "border-[var(--color-warn)]/40 text-[var(--color-warn)]" },
  "conflict-or-behind": { label: "Needs sync", cls: "border-[var(--color-warn)]/40 text-[var(--color-warn)]" },
  "local-ahead": { label: "Local ahead", cls: "border-[var(--color-warn)]/40 text-[var(--color-warn)]" },
  "unknown": { label: "Not scanned", cls: "border-[var(--color-line)] text-[var(--color-muted)]" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[var(--color-muted)]">{sub}</div>}
    </Panel>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <Panel className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
    </Panel>
  );
}
