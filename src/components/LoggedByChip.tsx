import { cn } from "@/lib/utils";
import { nameInitials } from "@/hooks/useLoggedByNames";

interface LoggedByChipProps {
  name?: string;
  className?: string;
}

export function LoggedByChip({ name, className }: LoggedByChipProps) {
  if (!name) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)}>
      <span aria-hidden className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 px-1 text-primary text-xs font-semibold leading-none">
        {nameInitials(name)}
      </span>
      <span className="sr-only">Logged by </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
