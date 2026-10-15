import { Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchFilter({
  onSearch,
  placeholder = "Search records…",
}: {
  onSearch: (query: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  function toggle() {
    if (open) {
      setQuery("");
      onSearch("");
    }
    setOpen(!open);
  }
  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      {open ? (
        <div className="w-full max-w-sm">
          <Input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); onSearch(event.target.value); }} placeholder={placeholder} />
        </div>
      ) : null}
      <Button type="button" size="icon" variant="outline" aria-label="Search" title="Search" onClick={toggle}>
        {open ? <X className="size-4" /> : <Search className="size-4" />}
      </Button>
    </div>
  );
}
