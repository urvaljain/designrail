/**
 * Salary policy: Evident shows pay only when the employer or the source states it.
 * It never estimates. A stated figure that fails a plausibility check is withheld and
 * flagged instead of being displayed as fact.
 */
export interface Salary {
  min: number;
  max: number;
  /** ISO 4217 code. */
  currency: string;
  period: "year" | "month" | "hour";
  raw: string;
}

export type SalaryResult =
  | { status: "employer_stated"; salary: Salary }
  | { status: "not_disclosed" }
  | { status: "rejected_implausible"; raw: string; reason: string };

const CURRENCY: Record<string, string> = { $: "USD", usd: "USD", "us$": "USD", "₹": "INR", inr: "INR", rs: "INR", "rs.": "INR", "€": "EUR", eur: "EUR", "£": "GBP", gbp: "GBP", "c$": "CAD", "ca$": "CAD", cad: "CAD", "a$": "AUD", "au$": "AUD", aud: "AUD", "s$": "SGD", sgd: "SGD" };

// Annualised plausibility bounds per currency. Outside these, a figure is far more likely to be a
// parsing or data-entry error (monthly stated as yearly, missing zeros) than a real offer.
const BOUNDS: Record<string, [number, number]> = {
  USD: [12_000, 1_500_000],
  EUR: [10_000, 1_200_000],
  GBP: [10_000, 1_200_000],
  CAD: [15_000, 2_000_000],
  AUD: [15_000, 2_000_000],
  SGD: [12_000, 2_000_000],
  INR: [100_000, 60_000_000],
};
const PERIOD_FACTOR: Record<Salary["period"], number> = { year: 1, month: 12, hour: 2080 };

function toNumber(num: string, suffix: string | undefined): number {
  const n = Number(num.replace(/,/g, ""));
  const sfx = (suffix ?? "").toLowerCase();
  if (sfx === "k") return n * 1_000;
  if (sfx === "m") return n * 1_000_000;
  if (sfx === "lpa" || sfx === "lakh" || sfx === "lakhs" || sfx === "lac" || sfx === "l") return n * 100_000;
  if (sfx === "cr" || sfx === "crore") return n * 10_000_000;
  return n;
}

function detectPeriod(context: string): Salary["period"] {
  if (/(per|an|\/)\s*(hour|hr)\b|hourly/i.test(context)) return "hour";
  if (/(per|a|\/)\s*(month|mo)\b|monthly|stipend/i.test(context)) return "month";
  return "year";
}

export function validateSalary(s: Salary): SalaryResult {
  if (!(s.min > 0) || !(s.max > 0)) return { status: "rejected_implausible", raw: s.raw, reason: "non-positive amount" };
  if (s.min > s.max) return { status: "rejected_implausible", raw: s.raw, reason: "minimum is greater than maximum" };
  if (s.max / s.min > 5) return { status: "rejected_implausible", raw: s.raw, reason: "range is too wide to be informative" };
  // A currency without bounds here still gets the structural checks above; its figure is shown as stated.
  const bounds = BOUNDS[s.currency];
  if (!bounds) return { status: "employer_stated", salary: s };
  const [lo, hi] = bounds;
  const annualMin = s.min * PERIOD_FACTOR[s.period];
  const annualMax = s.max * PERIOD_FACTOR[s.period];
  // Internship stipends are legitimately small; allow a lower floor for monthly/hourly figures.
  const floor = s.period === "year" ? lo : lo / 6;
  if (annualMin < floor || annualMax > hi) return { status: "rejected_implausible", raw: s.raw, reason: "outside the plausible range for this currency and period" };
  return { status: "employer_stated", salary: s };
}

const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s?(k|m|lpa|lakhs?|lac|l|cr|crore)?`;
const SYM = String.raw`(?:(?:US|CA|AU|C|A|S)?\$|[₹€£]|\b(?:usd|inr|eur|gbp|cad|aud|sgd|rs\.?)\s?)`;
const SYMBOL_RANGE = new RegExp(String.raw`(${SYM})\s?${NUM}\s*(?:-|–|—|to)\s*${SYM}?\s?${NUM}(?:\s*(usd|cad|aud|sgd|eur|gbp|inr)\b)?`, "i");
const SYMBOL_SINGLE = new RegExp(String.raw`(${SYM})\s?${NUM}(?:\s*(usd|cad|aud|sgd|eur|gbp|inr)\b)?`, "i");
const LPA_RANGE = /(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(lpa|lakhs?(?: per annum)?)/i;

/** Read a salary from free text. Only explicit, currency-marked figures in a pay context are accepted. */
export function parseSalaryText(text: string): SalaryResult {
  // A pay heading ("Salary range") puts the next two lines in a pay context too.
  let carry = 0;
  for (const line of text.split("\n")) {
    const payWord = /salary|compensation|pay\b|stipend|ctc|base|package|per (year|annum|month|hour)|\blpa\b|annually|\/(yr|year|hr|hour|mo|month)/i.test(line);
    const hasPayWord = payWord || carry > 0;
    carry = payWord ? 2 : Math.max(0, carry - 1);
    if (!hasPayWord) continue;
    // Funding and revenue figures are not salaries.
    if (/raised|funding|series [a-e]\b|revenue|valuation|arr\b|customers|users/i.test(line)) continue;

    const range = SYMBOL_RANGE.exec(line);
    if (range) {
      // A trailing ISO code ("$90,000—$120,000 CAD") overrides the bare symbol.
      const currency = range[6] ? range[6].toUpperCase() : CURRENCY[range[1]!.trim().toLowerCase()];
      if (!currency) continue;
      const sfx2 = range[5];
      const sfx1 = range[3] ?? sfx2; // "$90-120k" applies the suffix to both ends
      return validateSalary({ min: toNumber(range[2]!, sfx1), max: toNumber(range[4]!, sfx2), currency, period: detectPeriod(line), raw: range[0].trim() });
    }
    const lpa = LPA_RANGE.exec(line);
    if (lpa) {
      return validateSalary({ min: Number(lpa[1]) * 100_000, max: Number(lpa[2]) * 100_000, currency: "INR", period: "year", raw: lpa[0].trim() });
    }
    const single = SYMBOL_SINGLE.exec(line);
    if (single) {
      const currency = single[4] ? single[4].toUpperCase() : CURRENCY[single[1]!.trim().toLowerCase()];
      if (!currency) continue;
      const v = toNumber(single[2]!, single[3]);
      return validateSalary({ min: v, max: v, currency, period: detectPeriod(line), raw: single[0].trim() });
    }
  }
  return { status: "not_disclosed" };
}

/** Salary supplied by a source as structured fields (preferred over text parsing). */
export function fromStructured(min: unknown, max: unknown, currency: unknown, period: unknown, raw?: string): SalaryResult {
  const cur = typeof currency === "string" ? (CURRENCY[currency.toLowerCase()] ?? (/^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : null)) : null;
  const lo = typeof min === "number" ? min : typeof max === "number" ? max : null;
  const hi = typeof max === "number" ? max : lo;
  if (cur === null || lo === null || hi === null) return { status: "not_disclosed" };
  const p = typeof period === "string" ? period.toLowerCase() : "";
  const per: Salary["period"] = /hour/.test(p) ? "hour" : /month/.test(p) ? "month" : "year";
  return validateSalary({ min: lo, max: hi, currency: cur, period: per, raw: raw ?? `${cur} ${lo}-${hi} per ${per}` });
}

export function formatSalary(min: number, max: number, currency: string, period: string): string {
  const fmt = (n: number) => {
    if (currency === "INR") {
      if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
      return `₹${n.toLocaleString("en-IN")}`;
    }
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "CAD" ? "CA$" : currency === "AUD" ? "A$" : currency === "SGD" ? "S$" : `${currency} `;
    return n >= 10_000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n.toLocaleString("en-US")}`;
  };
  const range = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return `${range} per ${period}`;
}
