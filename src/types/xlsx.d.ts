declare module "xlsx" {
  export function read(data: ArrayBuffer, opts?: { type?: string }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  export function writeFile(workbook: unknown, filename: string): void;
  export const utils: {
    sheet_to_json: <T>(sheet: unknown, opts?: Record<string, unknown>) => T;
    aoa_to_sheet: (data: unknown[][]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (workbook: unknown, sheet: unknown, name: string) => void;
  };
}
