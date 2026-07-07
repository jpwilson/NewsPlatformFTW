// Per-section accent colours (Guardian-style). The actual hues live as CSS
// variables in index.css (:root = light values, .dark = dark values), so the
// same call site is automatically theme-correct.
//
// Works for both the ribbon's section ids ("politics", "tech", …) and
// free-form article category names ("Government", "Running", "Nutrition", …)
// via keyword rules. Unknown categories fall back to the brand blue.

const SECTION_VARS: Record<string, string> = {
  politics: "--cat-politics",
  business: "--cat-business",
  tech: "--cat-tech",
  ai: "--cat-ai",
  science: "--cat-science",
  sports: "--cat-sports",
  culture: "--cat-culture",
  lifestyle: "--cat-lifestyle",
  education: "--cat-education",
  environment: "--cat-environment",
  opinion: "--cat-opinion",
  law: "--cat-law",
};

// Checked in order — first match wins, so more specific rules come first.
const KEYWORD_RULES: Array<[RegExp, string]> = [
  [/artificial intelligence|\bai\b|machine learning|\bllm\b|robot/i, "ai"],
  [/politic|government|election|congress|senate|parliament|geopolit/i, "politics"],
  [/\blaw\b|legal|court|justice|crime/i, "law"],
  [/opinion|editorial|column|comment/i, "opinion"],
  [/environment|climate|nature|garden|wildlife|sustainab/i, "environment"],
  [/science|space|physics|biolog|astronom|research/i, "science"],
  [/sport|running|football|soccer|cycling|basketball|tennis|athlet|marathon|racing|endurance/i, "sports"],
  [/culture|\bart\b|music|film|movie|book|festival|theat/i, "culture"],
  [/education|school|university|learning|student/i, "education"],
  [/business|econom|market|finance|money|startup|invest/i, "business"],
  [/tech|software|computing|gadget|internet|crypto|cyber/i, "tech"],
  [/travel|food|cooking|nutrition|lifestyle|health|fitness|wellness|hobb/i, "lifestyle"],
];

/** CSS colour string for a category/section; brand blue if unrecognised. */
export function categoryColor(name?: string | null): string {
  if (name) {
    const key = name.trim().toLowerCase();
    const direct = SECTION_VARS[key];
    if (direct) return `hsl(var(${direct}))`;
    for (const [re, section] of KEYWORD_RULES) {
      if (re.test(name)) return `hsl(var(${SECTION_VARS[section]}))`;
    }
  }
  return "hsl(var(--edition-accent))";
}
