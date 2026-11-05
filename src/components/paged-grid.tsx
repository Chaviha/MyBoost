import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const INITIAL_ROWS = 3;
const ROWS_PER_CLICK = 2;

/** Number of grid columns for the current screen: 1 (phone), 2 (sm), 3 (lg). Matches `sm:grid-cols-2 lg:grid-cols-3`. */
function useGridColumns() {
  const read = () => {
    if (typeof window === "undefined") return 3;
    if (window.matchMedia("(min-width: 1024px)").matches) return 3;
    if (window.matchMedia("(min-width: 640px)").matches) return 2;
    return 1;
  };
  const [columns, setColumns] = useState(read);

  useEffect(() => {
    const update = () => setColumns(read());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}

/**
 * Shows the first 3 rows of cards, then a "More" button that reveals 2 more rows per click.
 * `resetKey` (e.g. search text + filter) sends it back to 3 rows; a background data refresh does not.
 */
export function PagedGrid<T>({
  items,
  getKey,
  renderItem,
  resetKey = "",
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  resetKey?: string;
}) {
  const columns = useGridColumns();
  const [extraRows, setExtraRows] = useState(0);

  useEffect(() => {
    setExtraRows(0);
  }, [resetKey]);

  const visibleCount = columns * (INITIAL_ROWS + extraRows);
  const visible = items.slice(0, visibleCount);
  const remaining = items.length - visible.length;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <div key={getKey(item)} className="contents">
            {renderItem(item)}
          </div>
        ))}
      </div>
      {remaining > 0 ? (
        <div className="mt-5 flex justify-center">
          <Button type="button" variant="secondary" onClick={() => setExtraRows((n) => n + ROWS_PER_CLICK)}>
            More
          </Button>
        </div>
      ) : null}
    </div>
  );
}
