export interface Writer {
  write(chunk: string): unknown;
}

export interface CliIO {
  stdout: Writer;
  stderr: Writer;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdoutIsTTY: boolean;
  env: Record<string, string | undefined>;
  cwd: string;
  /** Overrides "today" for task filenames (tests). */
  now?: () => Date;
}

export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  green(s: string): string;
  cyan(s: string): string;
}

const wrap = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;

export function createStyle(enabled: boolean): Style {
  if (!enabled) {
    const id = (s: string) => s;
    return { bold: id, dim: id, red: id, yellow: id, green: id, cyan: id };
  }
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    yellow: wrap(33, 39),
    green: wrap(32, 39),
    cyan: wrap(36, 39),
  };
}

export function colorEnabled(io: CliIO, flag: boolean | undefined): boolean {
  if (flag === false) return false;
  if (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "") return false;
  if (io.env.FORCE_COLOR && io.env.FORCE_COLOR !== "0") return true;
  return io.stdoutIsTTY;
}

export function isInteractive(io: CliIO): boolean {
  return Boolean(io.stdin.isTTY) && io.stdoutIsTTY && io.env.CI === undefined;
}
