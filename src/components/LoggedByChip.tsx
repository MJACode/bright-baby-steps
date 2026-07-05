import { cn } from "@/lib/utils";

interface LoggedByChipProps {
  name?: string;
  className?: string;
}

export function LoggedByChip({ name, className }: LoggedByChipProps) {
  if (!name) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold leading-none">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="sr-only">Logged by </span>
      {name}
    </span>
  );
}
