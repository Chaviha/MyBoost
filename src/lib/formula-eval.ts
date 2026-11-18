/**
 * Shared formula evaluator for product customizer / excel-style calculators.
 *
 * Supports:
 *   + - * / ^ ( )   and   % (postfix, 10% = 0.1)
 *   SIN, COS, TAN  (degrees — LifeBoost default for shop angles)
 *   SINDEG, COSDEG, TANDEG  (same as SIN/COS/TAN, degrees)
 *   SINRAD, COSRAD, TANRAD  (radians, Excel-style)
 *   ASIN, ACOS, ATAN, ATAN2(y,x)  (inverse trig — result in degrees; ASINDEG etc. are the same)
 *   ASINRAD, ACOSRAD, ATANRAD, ATAN2RAD  (result in radians, Excel-style)
 *   ABS, SQRT, MIN, MAX, SUM, AVERAGE, COUNT, SIGN, PI()
 *   ROUND, ROUNDUP, ROUNDDOWN, TRUNC, INT, FLOOR, CEIL/CEILING
 *   MOD, POWER, EXP, LN, LOG(x[,base]), LOG10
 *   IF(condition, then[, else])   — lazy: the branch not taken is never evaluated
 *   IFERROR(value, fallback)
 *   AND(a,b,…), OR(a,b,…), NOT(a)   and   && / || operators
 *   Comparisons: < > <= >= = == <> !=   (numbers and text, e.g. IF(MATERIAL="Mild Steel",1,2))
 *   TRUE / FALSE constants. Text in arithmetic counts as 0 (same as before).
 *
 * Truthiness: non-zero = true (Excel-like).
 */

export type FormulaError = Error;

type Val = number | string;

type Tok =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(input: string): Tok[] {
  const src = input;
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new Error("Missing closing quote in formula text.");
      tokens.push({ kind: "str", value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`Invalid number near “${src.slice(i, j)}”.`);
      tokens.push({ kind: "num", value: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ kind: "id", value: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if ((c === "&" && src[i + 1] === "&") || (c === "|" && src[i + 1] === "|")) {
      tokens.push({ kind: "op", value: c + c });
      i += 2;
      continue;
    }
    // multi-char compare ops
    if (c === "<" || c === ">" || c === "=" || c === "!") {
      let op = c;
      if (i + 1 < src.length) {
        const n = src[i + 1];
        if ((c === "<" && (n === "=" || n === ">")) || (c === ">" && n === "=") || (c === "=" && n === "=") || (c === "!" && n === "=")) {
          op = c + n;
          i += 2;
          tokens.push({ kind: "op", value: op });
          continue;
        }
      }
      tokens.push({ kind: "op", value: op });
      i++;
      continue;
    }
    if ("+-*/^%".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character “${c}” in formula.`);
  }
  return tokens;
}

function truthy(v: Val): boolean {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s !== "" && s !== "false" && s !== "0";
  }
  return v !== 0 && Number.isFinite(v);
}

/** Numbers pass through; numeric text becomes a number; other text counts as 0 (legacy behaviour). */
function num(v: Val): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : 0;
}

function compareVals(op: string, l: Val, r: Val): number {
  if (typeof l === "string" || typeof r === "string") {
    const ls = String(l).trim().toLowerCase();
    const rs = String(r).trim().toLowerCase();
    const bothNumeric = ls !== "" && rs !== "" && Number.isFinite(Number(ls)) && Number.isFinite(Number(rs));
    if (bothNumeric) return compareVals(op, Number(ls), Number(rs));
    const c = ls < rs ? -1 : ls > rs ? 1 : 0;
    switch (op) {
      case "<": return c < 0 ? 1 : 0;
      case ">": return c > 0 ? 1 : 0;
      case "<=": return c <= 0 ? 1 : 0;
      case ">=": return c >= 0 ? 1 : 0;
      case "=":
      case "==": return c === 0 ? 1 : 0;
      default: return c !== 0 ? 1 : 0;
    }
  }
  const eq = Math.abs(l - r) < 1e-9;
  switch (op) {
    case "<": return l < r && !eq ? 1 : 0;
    case ">": return l > r && !eq ? 1 : 0;
    case "<=": return l < r || eq ? 1 : 0;
    case ">=": return l > r || eq ? 1 : 0;
    case "=":
    case "==": return eq ? 1 : 0;
    default: return eq ? 0 : 1;
  }
}

/**
 * Evaluate a formula expression. Column keys should already be substituted
 * (see substituteCellValues). Leading "=" is optional.
 */
export function evaluateFormula(expression: string): number {
  const raw = expression.trim().replace(/^=/, "").trim();
  if (!raw) throw new Error("Empty formula.");
  const tokens = tokenize(raw);
  let index = 0;
  /** >0 while parsing a branch that is not taken: errors there are ignored (lazy IF / IFERROR). */
  let dry = 0;

  function peek(): Tok | undefined {
    return tokens[index];
  }
  function consume(): Tok {
    const t = tokens[index++];
    if (!t) throw new Error("Unexpected end of formula.");
    return t;
  }
  function matchOp(...ops: string[]): string | null {
    const t = peek();
    if (t?.kind === "op" && ops.includes(t.value)) {
      index++;
      return t.value;
    }
    return null;
  }
  function matchKind(kind: Tok["kind"]): boolean {
    if (peek()?.kind === kind) {
      index++;
      return true;
    }
    return false;
  }

  // precedence: || < && < compare < add < mul < unary < power < postfix % < primary
  function parseOr(): Val {
    let left = parseAnd();
    while (matchOp("||")) {
      const right = parseAnd();
      left = truthy(left) || truthy(right) ? 1 : 0;
    }
    return left;
  }

  function parseAnd(): Val {
    let left = parseCompare();
    while (matchOp("&&")) {
      const right = parseCompare();
      left = truthy(left) && truthy(right) ? 1 : 0;
    }
    return left;
  }

  function parseCompare(): Val {
    const left = parseAdd();
    const op = matchOp("<", ">", "<=", ">=", "=", "==", "<>", "!=");
    if (!op) return left;
    return compareVals(op, left, parseAdd());
  }

  function parseAdd(): Val {
    let left = parseMul();
    while (true) {
      if (matchOp("+")) left = num(left) + num(parseMul());
      else if (matchOp("-")) left = num(left) - num(parseMul());
      else break;
    }
    return left;
  }

  function parseMul(): Val {
    let left = parseUnary();
    while (true) {
      if (matchOp("*")) left = num(left) * num(parseUnary());
      else if (matchOp("/")) {
        const rhs = num(parseUnary());
        if (rhs === 0) {
          if (dry) left = 0;
          else throw new Error("Cannot divide by zero.");
        } else left = num(left) / rhs;
      } else break;
    }
    return left;
  }

  function parseUnary(): Val {
    if (matchOp("+")) return parseUnary();
    if (matchOp("-")) return -num(parseUnary());
    return parsePower();
  }

  function parsePower(): Val {
    let base = parsePrimary();
    while (matchOp("%")) base = num(base) / 100;
    if (matchOp("^")) {
      const exp = num(parseUnary());
      return Math.pow(num(base), exp);
    }
    return base;
  }

  function parseArgs(): Val[] {
    const args: Val[] = [];
    if (peek()?.kind === "rparen") return args;
    args.push(parseOr());
    while (matchKind("comma")) {
      args.push(parseOr());
    }
    return args;
  }

  function roundTo(x: number, places: number, mode: "round" | "up" | "down"): number {
    const f = Math.pow(10, places);
    const scaled = Number((Math.abs(x) * f).toFixed(9));
    const r = mode === "up" ? Math.ceil(scaled) : mode === "down" ? Math.floor(scaled) : Math.round(scaled);
    return (Math.sign(x) * r) / f;
  }

  function callFn(name: string, raw: Val[]): Val {
    const args = raw.map(num);
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    // Strip floating-point noise from inverse trig results (30.000000000000004 → 30)
    const tidy = (n: number) => Math.round(n * 1e10) / 1e10;
    const need = (n: number, msg: string) => {
      if (args.length !== n) throw new Error(msg);
    };
    switch (name) {
      // Degrees (default) — SIN(30) = 0.5
      case "SIN":
      case "SINDEG":
        need(1, "SIN needs 1 argument (degrees).");
        return Math.sin(toRad(args[0]));
      case "COS":
      case "COSDEG":
        need(1, "COS needs 1 argument (degrees).");
        return Math.cos(toRad(args[0]));
      case "TAN":
      case "TANDEG":
        need(1, "TAN needs 1 argument (degrees).");
        return Math.tan(toRad(args[0]));
      // Radians (Excel-style) — SINRAD(PI()/6) ≈ 0.5
      case "SINRAD":
        need(1, "SINRAD needs 1 argument (radians).");
        return Math.sin(args[0]);
      case "COSRAD":
        need(1, "COSRAD needs 1 argument (radians).");
        return Math.cos(args[0]);
      case "TANRAD":
        need(1, "TANRAD needs 1 argument (radians).");
        return Math.tan(args[0]);
      // Inverse trig — ASIN(0.5) = 30 (degrees). Input must be between -1 and 1 for ASIN/ACOS.
      case "ASIN":
      case "ASINDEG":
      case "ASINRAD": {
        need(1, `${name} needs 1 argument (a number from -1 to 1).`);
        if (args[0] < -1 || args[0] > 1) throw new Error(`${name} needs a value between -1 and 1.`);
        const r = Math.asin(args[0]);
        return name === "ASINRAD" ? tidy(r) : tidy((r * 180) / Math.PI);
      }
      case "ACOS":
      case "ACOSDEG":
      case "ACOSRAD": {
        need(1, `${name} needs 1 argument (a number from -1 to 1).`);
        if (args[0] < -1 || args[0] > 1) throw new Error(`${name} needs a value between -1 and 1.`);
        const r = Math.acos(args[0]);
        return name === "ACOSRAD" ? tidy(r) : tidy((r * 180) / Math.PI);
      }
      case "ATAN":
      case "ATANDEG":
      case "ATANRAD": {
        need(1, `${name} needs 1 argument.`);
        const r = Math.atan(args[0]);
        return name === "ATANRAD" ? tidy(r) : tidy((r * 180) / Math.PI);
      }
      case "ATAN2":
      case "ATAN2DEG":
      case "ATAN2RAD": {
        need(2, `${name} needs 2 arguments: ${name}(y, x).`);
        const r = Math.atan2(args[0], args[1]);
        return name === "ATAN2RAD" ? tidy(r) : tidy((r * 180) / Math.PI);
      }
      case "ABS":
        need(1, "ABS needs 1 argument.");
        return Math.abs(args[0]);
      case "SQRT":
        need(1, "SQRT needs 1 argument.");
        if (args[0] < 0) throw new Error("SQRT of negative number.");
        return Math.sqrt(args[0]);
      case "SIGN":
        need(1, "SIGN needs 1 argument.");
        return Math.sign(args[0]);
      case "FLOOR":
      case "INT":
        need(1, `${name} needs 1 argument.`);
        return Math.floor(args[0]);
      case "CEIL":
      case "CEILING":
        need(1, "CEIL needs 1 argument.");
        return Math.ceil(args[0]);
      case "ROUND":
      case "ROUNDUP":
      case "ROUNDDOWN":
      case "TRUNC": {
        if (args.length < 1 || args.length > 2) throw new Error(`${name} needs 1 or 2 arguments.`);
        const places = args[1] ?? 0;
        if (name === "ROUND") return roundTo(args[0], places, "round");
        return roundTo(args[0], places, name === "ROUNDUP" ? "up" : "down");
      }
      case "MOD": {
        need(2, "MOD needs 2 arguments: MOD(number, divisor).");
        if (args[1] === 0) throw new Error("MOD divisor cannot be zero.");
        return args[0] - args[1] * Math.floor(args[0] / args[1]);
      }
      case "POWER":
        need(2, "POWER needs 2 arguments: POWER(base, exponent).");
        return Math.pow(args[0], args[1]);
      case "EXP":
        need(1, "EXP needs 1 argument.");
        return Math.exp(args[0]);
      case "LN":
        need(1, "LN needs 1 argument.");
        if (args[0] <= 0) throw new Error("LN needs a value above 0.");
        return Math.log(args[0]);
      case "LOG10":
        need(1, "LOG10 needs 1 argument.");
        if (args[0] <= 0) throw new Error("LOG10 needs a value above 0.");
        return Math.log10(args[0]);
      case "LOG": {
        if (args.length < 1 || args.length > 2) throw new Error("LOG needs 1 or 2 arguments: LOG(x[, base]).");
        if (args[0] <= 0) throw new Error("LOG needs a value above 0.");
        const base = args[1] ?? 10;
        if (base <= 0 || base === 1) throw new Error("LOG base must be above 0 and not 1.");
        return Math.log(args[0]) / Math.log(base);
      }
      case "MIN":
        if (args.length < 1) throw new Error("MIN needs at least 1 argument.");
        return Math.min(...args);
      case "MAX":
        if (args.length < 1) throw new Error("MAX needs at least 1 argument.");
        return Math.max(...args);
      case "SUM":
        return args.reduce((a, b) => a + b, 0);
      case "AVERAGE":
      case "AVG":
        if (args.length < 1) throw new Error("AVERAGE needs at least 1 argument.");
        return args.reduce((a, b) => a + b, 0) / args.length;
      case "COUNT":
        return args.length;
      case "PI":
        if (args.length !== 0) throw new Error("PI() takes no arguments.");
        return Math.PI;
      case "AND":
        if (raw.length < 1) throw new Error("AND needs at least 1 argument.");
        return raw.every(truthy) ? 1 : 0;
      case "OR":
        if (raw.length < 1) throw new Error("OR needs at least 1 argument.");
        return raw.some(truthy) ? 1 : 0;
      case "NOT":
        if (raw.length !== 1) throw new Error("NOT needs 1 argument.");
        return truthy(raw[0]) ? 0 : 1;
      default:
        throw new Error(`Unknown function “${name}”.`);
    }
  }

  /** Parse an expression that will not be used: errors inside it are ignored. */
  function parseSkipped(): void {
    dry++;
    try {
      parseOr();
    } finally {
      dry--;
    }
  }

  function expectComma(fn: string) {
    if (!matchKind("comma")) throw new Error(`${fn} is missing a comma between arguments.`);
  }
  function expectRparen(fn: string) {
    if (!matchKind("rparen")) throw new Error(`Missing ) after ${fn}(...).`);
  }

  function parseIf(): Val {
    const cond = truthy(parseOr());
    expectComma("IF");
    let thenV: Val = 0;
    let elseV: Val = 0;
    if (cond) thenV = parseOr();
    else parseSkipped();
    if (matchKind("comma")) {
      if (cond) parseSkipped();
      else elseV = parseOr();
    }
    expectRparen("IF");
    return cond ? thenV : elseV;
  }

  function parseIfError(): Val {
    const start = index;
    let value: Val = 0;
    let failed = false;
    try {
      value = parseOr();
      if (typeof value === "number" && !Number.isFinite(value)) failed = true;
    } catch {
      failed = true;
    }
    if (failed) {
      index = start;
      parseSkipped();
    }
    expectComma("IFERROR");
    let fallback: Val = 0;
    if (failed) fallback = parseOr();
    else parseSkipped();
    expectRparen("IFERROR");
    return failed ? fallback : value;
  }

  function parsePrimary(): Val {
    const t = peek();
    if (!t) throw new Error("Unexpected end of formula.");

    if (t.kind === "num") {
      consume();
      return t.value;
    }

    if (t.kind === "str") {
      consume();
      return t.value;
    }

    if (t.kind === "id") {
      consume();
      // function call
      if (peek()?.kind === "lparen") {
        consume(); // (
        if (t.value === "IF") return parseIf();
        if (t.value === "IFERROR") return parseIfError();
        const args = parseArgs();
        expectRparen(t.value);
        if (dry) {
          try {
            return callFn(t.value, args);
          } catch {
            return 0;
          }
        }
        return callFn(t.value, args);
      }
      // constants
      if (t.value === "PI") return Math.PI;
      if (t.value === "TRUE") return 1;
      if (t.value === "FALSE") return 0;
      throw new Error(`Unknown name “${t.value}”. Use column keys in formulas (they are replaced before evaluation).`);
    }

    if (t.kind === "lparen") {
      consume();
      const v = parseOr();
      if (!matchKind("rparen")) throw new Error("Missing closing parenthesis.");
      return v;
    }

    throw new Error("Invalid formula.");
  }

  const result = parseOr();
  if (index !== tokens.length) throw new Error("Invalid formula (extra tokens).");
  const out = typeof result === "string" ? (result.trim() !== "" && Number.isFinite(Number(result)) ? Number(result) : NaN) : result;
  if (typeof result === "string" && !Number.isFinite(out)) throw new Error("Formula returned text, not a number.");
  if (!Number.isFinite(out)) throw new Error("Invalid formula result.");
  return out;
}

/** @deprecated alias — prefer evaluateFormula */
export function evaluateArithmetic(expression: string): number {
  return evaluateFormula(expression);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cellLiteral(v: unknown): string {
  if (v === null || v === undefined || v === "") return "0";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? (v < 0 ? `(${v})` : String(v)) : "0";
  const s = String(v).trim();
  if (s.toLowerCase() === "true") return "1";
  if (s.toLowerCase() === "false") return "0";
  const n = Number(s);
  if (s !== "" && Number.isFinite(n)) return n < 0 ? `(${n})` : String(n);
  return `"${s.replace(/"/g, "'")}"`;
}

/**
 * Replace column keys in a formula with their cell values: numbers as numbers,
 * checkbox true/false as 1/0, and other text as a quoted string so it can be
 * compared (IF(MATERIAL="Mild Steel",…)). Text already inside quotes in the
 * formula is left alone, and a key followed by "(" is treated as a function.
 */
export function substituteCellValues(
  expression: string,
  cells: Record<string, unknown>,
  keys: string[],
): string {
  const sorted = [...new Set(keys.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!sorted.length) return expression;
  const lookup = new Map(sorted.map((k) => [k.toUpperCase(), k]));
  const re = new RegExp(
    `(?<![A-Za-z0-9_])(${sorted.map(escapeRe).join("|")})(?![A-Za-z0-9_])(?!\\s*\\()`,
    "gi",
  );
  return expression
    .split(/("[^"]*"|'[^']*')/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(re, (m) => cellLiteral(cells[lookup.get(m.toUpperCase()) ?? m]))))
    .join("");
}

/** Substitute cell values into a formula and evaluate it. */
export function evaluateWithCells(
  expression: string,
  cells: Record<string, unknown>,
  keys: string[],
): number {
  return evaluateFormula(substituteCellValues(expression.trim().replace(/^=/, ""), cells, keys));
}
