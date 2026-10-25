import type * as t from "@babel/types";
import { parseClass } from "../parsers/tailwind.js";
import { LineIndex, traverse } from "../parsers/source.js";
import { parseSuppression } from "../suppressions.js";
import type { AttrValue, ClassToken, FileAnalysis, JsxElementInfo, Loc, StyleDeclaration } from "../types.js";

/** React style properties that take unitless numbers (React does not append "px"). */
const UNITLESS = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "gridArea",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "fontWeight",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
]);

const CLASS_ATTRIBUTE = /^(class|className|[a-zA-Z]+ClassName)$/;

export function toKebabProperty(key: string): string {
  if (key.startsWith("--")) return key;
  const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return /^(webkit|moz|ms|o)-/.test(kebab) ? `-${kebab}` : kebab;
}

function unwrap(node: t.Node): t.Node {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ParenthesizedExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = (current as t.TSAsExpression).expression;
  }
  return current;
}

function jsxName(name: t.JSXOpeningElement["name"]): string {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  return `${jsxName(name.object as t.JSXOpeningElement["name"])}.${name.property.name}`;
}

interface Collector {
  file: FileAnalysis;
  index: LineIndex;
  classFunctions: Set<string>;
  handledCalls: Set<t.Node>;
  labelNames: Set<string>;
}

function locOf(c: Collector, offset: number): Loc {
  return c.index.locate(offset);
}

function nodeLoc(node: t.Node): Loc {
  return { line: node.loc?.start.line ?? 1, column: (node.loc?.start.column ?? 0) + 1 };
}

function sourceText(c: Collector, node: t.Node): string {
  const text = c.file.content.slice(node.start ?? 0, node.end ?? 0).replace(/\s+/g, " ");
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function addClasses(
  c: Collector,
  text: string,
  startOffset: number,
  origin: ClassToken["origin"],
  trim: { start: boolean; end: boolean } = { start: false, end: false },
): void {
  const matches = [...text.matchAll(/\S+/g)];
  matches.forEach((match, i) => {
    const touchesStart = trim.start && i === 0 && match.index === 0;
    const touchesEnd = trim.end && i === matches.length - 1 && match.index + match[0].length === text.length;
    const loc = locOf(c, startOffset + match.index);
    if (touchesStart || touchesEnd) {
      c.file.coverage.push({
        loc,
        kind: "partial-class",
        detail: `class fragment "${match[0]}" is joined to a dynamic expression and was not analyzed`,
      });
      return;
    }
    c.file.classTokens.push({ raw: match[0], loc, parsed: parseClass(match[0]), origin });
  });
}

/** A part of a concatenated string: literal text with its source offset, or a dynamic expression. */
type Part = { kind: "text"; text: string; offset: number } | { kind: "expr"; node: t.Node };

function stringParts(c: Collector, node: t.Node): Part[] | null {
  const n = unwrap(node);
  if (n.type === "StringLiteral") {
    const raw = c.file.content.slice((n.start ?? 0) + 1, (n.end ?? 0) - 1);
    return [{ kind: "text", text: raw === n.value ? raw : n.value, offset: (n.start ?? 0) + 1 }];
  }
  if (n.type === "TemplateLiteral") {
    const parts: Part[] = [];
    n.quasis.forEach((q, i) => {
      parts.push({ kind: "text", text: q.value.cooked ?? q.value.raw, offset: q.start ?? 0 });
      const expr = n.expressions[i];
      if (expr) parts.push({ kind: "expr", node: expr });
    });
    return parts;
  }
  if (n.type === "BinaryExpression" && n.operator === "+") {
    const left = stringParts(c, n.left) ?? [{ kind: "expr", node: n.left }];
    const right = stringParts(c, n.right) ?? [{ kind: "expr", node: n.right }];
    if (left.every((p) => p.kind === "expr") && right.every((p) => p.kind === "expr")) return null;
    return [...left, ...right];
  }
  return null;
}

function analyzeParts(c: Collector, parts: Part[], origin: ClassToken["origin"]): void {
  parts.forEach((part, i) => {
    if (part.kind === "expr") {
      analyzeClassExpression(c, part.node, origin);
      return;
    }
    const prev = parts[i - 1];
    const next = parts[i + 1];
    addClasses(c, part.text, part.offset, origin, {
      start: prev?.kind === "expr" && !/^\s/.test(part.text),
      end: next?.kind === "expr" && !/\s$/.test(part.text),
    });
  });
}

function dynamicClass(c: Collector, node: t.Node): void {
  c.file.coverage.push({
    loc: nodeLoc(node),
    kind: "dynamic-class",
    detail: `class expression \`${sourceText(c, node)}\` is computed at runtime and was not analyzed`,
  });
}

/** Extracts statically knowable classes from a className expression. */
function analyzeClassExpression(c: Collector, node: t.Node, origin: ClassToken["origin"]): void {
  const n = unwrap(node);
  switch (n.type) {
    case "StringLiteral":
    case "TemplateLiteral":
      analyzeParts(c, stringParts(c, n)!, origin);
      return;
    case "BinaryExpression": {
      const parts = stringParts(c, n);
      if (parts) analyzeParts(c, parts, origin);
      else dynamicClass(c, n);
      return;
    }
    case "ConditionalExpression":
      analyzeClassExpression(c, n.consequent, origin);
      analyzeClassExpression(c, n.alternate, origin);
      return;
    case "LogicalExpression":
      if (n.operator !== "&&") analyzeClassExpression(c, n.left, origin);
      analyzeClassExpression(c, n.right, origin);
      return;
    case "ArrayExpression":
      for (const el of n.elements)
        if (el && el.type !== "SpreadElement") analyzeClassExpression(c, el, origin);
        else if (el) dynamicClass(c, el);
      return;
    case "CallExpression":
      if (n.callee.type === "Identifier" && c.classFunctions.has(n.callee.name)) {
        analyzeClassCall(c, n);
        return;
      }
      dynamicClass(c, n);
      return;
    case "NullLiteral":
    case "BooleanLiteral":
    case "JSXEmptyExpression":
      return;
    case "Identifier":
      if (n.name === "undefined") return;
      dynamicClass(c, n);
      return;
    default:
      dynamicClass(c, n);
  }
}

function objectKeyClasses(c: Collector, obj: t.ObjectExpression): void {
  for (const prop of obj.properties) {
    if (prop.type !== "ObjectProperty" || prop.computed) {
      dynamicClass(c, prop);
      continue;
    }
    if (prop.key.type === "StringLiteral") analyzeParts(c, stringParts(c, prop.key)!, "class-function");
    else if (prop.key.type === "Identifier")
      addClasses(c, prop.key.name, prop.key.start ?? 0, "class-function");
  }
}

function propValue(obj: t.ObjectExpression, name: string): t.Node | null {
  for (const prop of obj.properties) {
    if (prop.type !== "ObjectProperty" || prop.computed) continue;
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (key === name) return prop.value;
  }
  return null;
}

/** Variant maps (cva/tv): values are classes, or slot objects whose values are classes. */
function variantValues(c: Collector, node: t.Node): void {
  const n = unwrap(node);
  if (n.type === "ObjectExpression") {
    for (const prop of n.properties) {
      if (prop.type === "ObjectProperty") variantValues(c, prop.value);
    }
    return;
  }
  analyzeClassExpression(c, n, "class-function");
}

function analyzeClassCall(c: Collector, call: t.CallExpression): void {
  c.handledCalls.add(call);
  const name = call.callee.type === "Identifier" ? call.callee.name : "";
  const variantStyle = name === "cva" || name === "tv";
  call.arguments.forEach((arg, index) => {
    if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
      dynamicClass(c, arg);
      return;
    }
    const a = unwrap(arg);
    if (variantStyle && a.type === "ObjectExpression" && (name === "tv" || index > 0)) {
      const base = propValue(a, "base");
      if (base) analyzeClassExpression(c, base, "class-function");
      const slots = propValue(a, "slots");
      if (slots) variantValues(c, slots);
      const variants = propValue(a, "variants");
      if (variants && unwrap(variants).type === "ObjectExpression") {
        for (const group of (unwrap(variants) as t.ObjectExpression).properties) {
          if (group.type === "ObjectProperty") variantValues(c, group.value);
        }
      }
      const compound = propValue(a, "compoundVariants");
      if (compound && unwrap(compound).type === "ArrayExpression") {
        for (const el of (unwrap(compound) as t.ArrayExpression).elements) {
          if (el && unwrap(el).type === "ObjectExpression") {
            for (const key of ["class", "className"]) {
              const v = propValue(unwrap(el) as t.ObjectExpression, key);
              if (v) analyzeClassExpression(c, v, "class-function");
            }
          }
        }
      }
      return;
    }
    if (!variantStyle && a.type === "ObjectExpression") {
      objectKeyClasses(c, a);
      return;
    }
    analyzeClassExpression(c, a, "class-function");
  });
}

function attrValue(c: Collector, attr: t.JSXAttribute): AttrValue {
  const value = attr.value;
  if (!value) return { kind: "boolean" };
  if (value.type === "StringLiteral") return { kind: "string", value: value.value };
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression;
    if (expr.type === "JSXEmptyExpression") return { kind: "empty" };
    const e = unwrap(expr);
    if (e.type === "StringLiteral") return { kind: "string", value: e.value };
    if (e.type === "TemplateLiteral" && e.expressions.length === 0)
      return { kind: "string", value: e.quasis.map((q) => q.value.cooked ?? "").join("") };
    if (e.type === "NullLiteral" || (e.type === "Identifier" && e.name === "undefined"))
      return { kind: "nullish", text: sourceText(c, e) };
    return { kind: "expression", text: c.file.content.slice(e.start ?? 0, e.end ?? 0).replace(/\s+/g, "") };
  }
  return { kind: "expression", text: sourceText(c, value) };
}

function attrName(attr: t.JSXAttribute): string {
  return attr.name.type === "JSXIdentifier"
    ? attr.name.name
    : `${attr.name.namespace.name}:${attr.name.name.name}`;
}

function styleDeclarations(c: Collector, element: string, expr: t.Node, attrLoc: Loc): void {
  const index = c.file.styleAttributes.length;
  const n = unwrap(expr);
  if (n.type !== "ObjectExpression") {
    c.file.styleAttributes.push({
      element,
      loc: attrLoc,
      kind: "dynamic",
      declarations: [],
      dynamicParts: 1,
    });
    c.file.coverage.push({
      loc: attrLoc,
      kind: "dynamic-style",
      detail: `style={${sourceText(c, n)}} is not an object literal and was not analyzed`,
    });
    return;
  }
  const info = {
    element,
    loc: attrLoc,
    kind: "object" as const,
    declarations: [] as number[],
    dynamicParts: 0,
  };
  c.file.styleAttributes.push(info);
  for (const prop of n.properties) {
    if (prop.type !== "ObjectProperty" || prop.computed) {
      info.dynamicParts++;
      c.file.coverage.push({
        loc: nodeLoc(prop),
        kind: "dynamic-style",
        detail: `style entry \`${sourceText(c, prop)}\` (spread or computed key) was not analyzed`,
      });
      continue;
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (key === null) continue;
    const valueNode = unwrap(prop.value);
    let value: string | null = null;
    let fromNumber = false;
    if (valueNode.type === "StringLiteral") value = valueNode.value;
    else if (valueNode.type === "TemplateLiteral" && valueNode.expressions.length === 0)
      value = valueNode.quasis.map((q) => q.value.cooked ?? "").join("");
    else if (valueNode.type === "NumericLiteral") {
      fromNumber = true;
      value =
        UNITLESS.has(key) || key.startsWith("--") || valueNode.value === 0
          ? String(valueNode.value)
          : `${valueNode.value}px`;
    } else if (
      valueNode.type === "UnaryExpression" &&
      valueNode.operator === "-" &&
      valueNode.argument.type === "NumericLiteral"
    ) {
      fromNumber = true;
      value = UNITLESS.has(key) ? `-${valueNode.argument.value}` : `-${valueNode.argument.value}px`;
    }
    if (value === null) {
      info.dynamicParts++;
      c.file.coverage.push({
        loc: nodeLoc(prop),
        kind: "dynamic-style",
        detail: `style value for ${key} (\`${sourceText(c, valueNode)}\`) is computed at runtime and was not analyzed`,
      });
      continue;
    }
    const property = toKebabProperty(key);
    if (property.startsWith("--")) c.file.localCustomProperties.add(property);
    const declaration: StyleDeclaration = {
      property,
      value,
      loc: nodeLoc(prop),
      origin: "jsx-style",
      isCustomPropertyDefinition: property.startsWith("--"),
      inThemeBlock: false,
      fromNumber,
      styleAttribute: index,
    };
    info.declarations.push(c.file.declarations.length);
    c.file.declarations.push(declaration);
  }
}

function isComponentRoot(ancestors: readonly t.Node[]): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (a.type === "ReturnStatement" || a.type === "ArrowFunctionExpression") return true;
    if (
      a.type === "ConditionalExpression" ||
      a.type === "LogicalExpression" ||
      a.type === "ParenthesizedExpression"
    )
      continue;
    return false;
  }
  return false;
}

export interface TsxAnalysisOptions {
  classFunctions: string[];
  /** Local names of components that render <label> (from the registry), e.g. "Label". */
  labelComponents: string[];
}

/** Collects all facts rules need from a parsed TS/JS module. */
export function analyzeModule(file: FileAnalysis, ast: t.File, options: TsxAnalysisOptions): void {
  const c: Collector = {
    file,
    index: new LineIndex(file.content),
    classFunctions: new Set(options.classFunctions),
    handledCalls: new Set(),
    labelNames: new Set(["label", ...options.labelComponents]),
  };

  for (const comment of ast.comments ?? []) {
    const loc = { line: comment.loc?.start.line ?? 1, column: (comment.loc?.start.column ?? 0) + 1 };
    const directive = parseSuppression(comment.value, loc, comment.loc?.end.line ?? loc.line);
    if (directive) file.suppressions.push(directive);
  }

  for (const statement of ast.program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    const specifiers = statement.specifiers
      .filter((s) => !(s.type === "ImportSpecifier" && s.importKind === "type"))
      .map((s) => {
        if (s.type === "ImportDefaultSpecifier") return { imported: "default", local: s.local.name };
        if (s.type === "ImportNamespaceSpecifier") return { imported: "*", local: s.local.name };
        return {
          imported: s.imported.type === "Identifier" ? s.imported.name : s.imported.value,
          local: s.local.name,
        };
      });
    file.imports.push({ source: statement.source.value, specifiers, loc: nodeLoc(statement) });
    for (const s of specifiers) if (options.labelComponents.includes(s.imported)) c.labelNames.add(s.local);
  }

  traverse(ast.program, (node, ancestors) => {
    if (node.type === "JSXElement") {
      const opening = node.openingElement;
      const name = jsxName(opening.name);
      const attributes = new Map<string, AttrValue>();
      let hasSpread = false;
      for (const attr of opening.attributes) {
        if (attr.type === "JSXSpreadAttribute") {
          hasSpread = true;
          continue;
        }
        const key = attrName(attr);
        attributes.set(key, attrValue(c, attr));
        if (CLASS_ATTRIBUTE.test(key) && attr.value) {
          if (attr.value.type === "StringLiteral") analyzeParts(c, stringParts(c, attr.value)!, "jsx");
          else if (
            attr.value.type === "JSXExpressionContainer" &&
            attr.value.expression.type !== "JSXEmptyExpression"
          ) {
            analyzeClassExpression(c, attr.value.expression, "jsx");
          }
        }
        if (
          key === "style" &&
          attr.value?.type === "JSXExpressionContainer" &&
          attr.value.expression.type !== "JSXEmptyExpression"
        ) {
          styleDeclarations(c, name, attr.value.expression, nodeLoc(attr));
        }
        if (key === "htmlFor" || key === "for") {
          const v = attributes.get(key)!;
          if (v.kind === "string") file.labelTargets.static.add(v.value);
          else if (v.kind === "expression") file.labelTargets.expressions.add(v.text);
        }
      }
      const insideLabel = ancestors.some(
        (a) => a.type === "JSXElement" && c.labelNames.has(jsxName(a.openingElement.name)),
      );
      const info: JsxElementInfo = {
        name,
        intrinsic: /^[a-z]/.test(name) && !name.includes("."),
        attributes,
        hasSpread,
        loc: nodeLoc(opening),
        insideLabel,
        isComponentRoot: isComponentRoot(ancestors),
      };
      file.elements.push(info);
      return;
    }
    if (
      node.type === "CallExpression" &&
      !c.handledCalls.has(node) &&
      node.callee.type === "Identifier" &&
      c.classFunctions.has(node.callee.name)
    ) {
      // Class helpers outside JSX attributes, e.g. `const buttonVariants = cva("...")`.
      const insideClassAttr = ancestors.some(
        (a) => a.type === "JSXAttribute" && CLASS_ATTRIBUTE.test(attrName(a)),
      );
      if (!insideClassAttr) analyzeClassCall(c, node);
    }
  });
}
