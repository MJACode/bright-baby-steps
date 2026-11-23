import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchCatalogFoods } from "@/lib/foodAvoidances";
import type { CatalogFood } from "@/lib/foodCatalog";

/**
 * A text field with catalog suggestions listed right under it while the parent
 * types. Free text stays allowed: a suggestion only applies when tapped.
 */
export function FoodSearchField({
  id,
  value,
  onValueChange,
  onPick,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (text: string) => void;
  onPick: (food: CatalogFood) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  // Only text the parent typed opens the list, so a prefill or a pick doesn't.
  const [typing, setTyping] = useState(false);
  const matches = typing ? searchCatalogFoods(value) : [];
  const open = matches.length > 0;

  return (
    <div className="space-y-1">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          setTyping(true);
          onValueChange(e.target.value);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Food suggestions" className="overflow-hidden rounded-xl border border-border bg-card">
          {matches.map((food) => (
            <li key={food.slug} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  setTyping(false);
                  onPick(food);
                }}
                className="touch-target flex w-full items-center px-3 text-left text-sm font-semibold transition-colors hover:bg-feeding/10 focus-visible:bg-feeding/10 focus-visible:outline-none motion-reduce:transition-none"
              >
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
