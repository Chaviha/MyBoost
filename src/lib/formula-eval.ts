/**
 * Shared formula evaluator for product customizer / excel-style calculators.
 *
 * Supports:
 *   + - * / ( )
 *   SIN, COS, TAN  (radians, Excel-compatible)
 *   SINDEG, COSDEG, TANDEG  (degrees)
 *   ABS, SQRT, MIN, MAX, ROUND, FLOOR, CEIL, PI()
 *   IF(condition, then, else)
 *   Comparisons in IF: < > <= >= = == <> !=
 *   AND(a,b,…), OR(a,b,…), NOT(a)
 *
 * Truthiness: non-zero = true (Excel-like).
 */

export type FormulaError = Error;

type Tok =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(input: string): Tok[] {
  const src = input.replace(/\s+/g, "");
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
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
    if ("+-*/^".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character “${c}” in formula.`);
  }
  return tokens;
}

function truthy(n: number): boolean {
  return n !== 0 && Number.isFinite(n);
}

/**
 * Evaluate a formula expression. Column keys should already be substituted with numbers.
 * Leading "=" is optional.
 */
export function evaluateFormula(expression: string): number {
  const raw = expression.trim().replace(/^=/, "").trim();
  if (!raw) throw new Error("Empty formula.");
  const tokens = tokenize(raw);
  let index = 0;

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

  // precedence: or < and < compare < add < mul < unary < power < primary
  function parseOr(): number {
    let left = parseAnd();
    while (true) {
      const t = peek();
      if (t?.kind === "id" && t.value === "OR") {
        // OR as binary keyword between values is awkward; support OR(a,b) as function only.
        break;
      }
      break;
    }
    return left;
  }

  function parseAnd(): number {
    return parseCompare();
  }

  function parseCompare(): number {
    let left = parseAdd();
    const op = matchOp("<", ">", "<=", ">=", "=", "==", "<>", "!=");
    if (!op) return left;
    const right = parseAdd();
    switch (op) {
      case "<":
        return left < right ? 1 : 0;
      case ">":
        return left > right ? 1 : 0;
      case "<=":
        return left <= right ? 1 : 0;
      case ">=":
        return left >= right ? 1 : 0;
      case "=":
      case "==":
        return left === right ? 1 : 0;
      case "<>":
      case "!=":
        return left !== right ? 1 : 0;
      default:
        return left;
    }
  }

  function parseAdd(): number {
    let left = parseMul();
    while (true) {
      if (matchOp("+")) left = left + parseMul();
      else if (matchOp("-")) left = left - parseMul();
      else break;
    }
    return left;
  }

  function parseMul(): number {
    let left = parseUnary();
    while (true) {
      if (matchOp("*")) left = left * parseUnary();
      else if (matchOp("/")) {
        const rhs = parseUnary();
        if (rhs === 0) throw new Error("Cannot divide by zero.");
        left = left / rhs;
      } else break;
    }
    return left;
  }

  function parseUnary(): number {
    if (matchOp("+")) return parseUnary();
    if (matchOp("-")) return -parseUnary();
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (matchOp("^")) {
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseArgs(): number[] {
    const args: number[] = [];
    if (peek()?.kind === "rparen") return args;
    args.push(parseOr());
    while (matchKind("comma")) {
      args.push(parseOr());
    }
    return args;
  }

  function callFn(name: string, args: number[]): number {
    const deg = (r: number) => (r * Math.PI) / 180;
    switch (name) {
      case "SIN":
        if (args.length !== 1) throw new Error("SIN needs 1 argument (radians).");
        return Math.sin(args[0]);
      case "COS":
        if (args.length !== 1) throw new Error("COS needs 1 argument (radians).");
        return Math.cos(args[0]);
      case "TAN":
        if (args.length !== 1) throw new Error("TAN needs 1 argument (radians).");
        return Math.tan(args[0]);
      case "SINDEG":
        if (args.length !== 1) throw new Error("SINDEG needs 1 argument (degrees).");
        return Math.sin(deg(args[0]));
      case "COSDEG":
        if (args.length !== 1) throw new Error("COSDEG needs 1 argument (degrees).");
        return Math.cos(deg(args[0]));
      case "TANDEG":
        if (args.length !== 1) throw new Error("TANDEG needs 1 argument (degrees).");
        return Math.tan(deg(args[0]));
      case "ABS":
        if (args.length !== 1) throw new Error("ABS needs 1 argument.");
        return Math.abs(args[0]);
      case "SQRT":
        if (args.length !== 1) throw new Error("SQRT needs 1 argument.");
        if (args[0] < 0) throw new Error("SQRT of negative number.");
        return Math.sqrt(args[0]);
      case "FLOOR":
        if (args.length !== 1) throw new Error("FLOOR needs 1 argument.");
        return Math.floor(args[0]);
      case "CEIL":
      case "CEILING":
        if (args.length !== 1) throw new Error("CEIL needs 1 argument.");
        return Math.ceil(args[0]);
      case "ROUND":
        if (args.length < 1 || args.length > 2) throw new Error("ROUND needs 1 or 2 arguments.");
        {
          const places = args[1] ?? 0;
          const f = Math.pow(10, places);
          return Math.round(args[0] * f) / f;
        }
      case "MIN":
        if (args.length < 1) throw new Error("MIN needs at least 1 argument.");
        return Math.min(...args);
      case "MAX":
        if (args.length < 1) throw new Error("MAX needs at least 1 argument.");
        return Math.max(...args);
      case "PI":
        if (args.length !== 0) throw new Error("PI() takes no arguments.");
        return Math.PI;
      case "IF":
        if (args.length !== 3) throw new Error("IF needs 3 arguments: IF(condition, then, else).");
        return truthy(args[0]) ? args[1] : args[2];
      case "AND":
        if (args.length < 1) throw new Error("AND needs at least 1 argument.");
        return args.every(truthy) ? 1 : 0;
      case "OR":
        if (args.length < 1) throw new Error("OR needs at least 1 argument.");
        return args.some(truthy) ? 1 : 0;
      case "NOT":
        if (args.length !== 1) throw new Error("NOT needs 1 argument.");
        return truthy(args[0]) ? 0 : 1;
      default:
        throw new Error(`Unknown function “${name}”.`);
    }
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error("Unexpected end of formula.");

    if (t.kind === "num") {
      consume();
      return t.value;
    }

    if (t.kind === "id") {
      consume();
      // function call
      if (peek()?.kind === "lparen") {
        consume(); // (
        const args = parseArgs();
        if (!matchKind("rparen")) throw new Error(`Missing ) after ${t.value}(...).`);
        return callFn(t.value, args);
      }
      // bare PI constant
      if (t.value === "PI") return Math.PI;
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
  if (!Number.isFinite(result)) throw new Error("Invalid formula result.");
  return result;
}

/** @deprecated alias — prefer evaluateFormula */
export function evaluateArithmetic(expression: string): number {
  return evaluateFormula(expression);
}
