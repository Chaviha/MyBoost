declare module "xlsx" {
  export function read(data: ArrayBuffer, opts?: { type?: string }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  export const utils: {
    sheet_to_json: <T>(sheet: unknown, opts?: Record<string, unknown>) => T;
  };
}
