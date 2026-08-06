/**
 * zodiac.ts — derives Western zodiac, Chinese zodiac and horoscope notes
 * from an applicant's date of birth.
 *
 * Everything here is pure and offline: given a `date_of_birth` string it
 * returns a fully-built profile, so the UI never has to call an astrology API.
 *
 * Two details worth knowing before editing:
 *  • Dates are parsed field-by-field, NOT with `new Date("YYYY-MM-DD")` —
 *    that parses as UTC and can slide a birthday back a day in HK time,
 *    which would silently flip a cusp birthday to the wrong sign.
 *  • The Chinese zodiac year turns over at Chinese New Year (anywhere from
 *    Jan 21 to Feb 20), not on Jan 1 — hence the CNY_DATES table. Someone
 *    born 20 Jan 1990 is a Snake, not a Horse.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface LuckyColor { name: string; hex: string; }

export interface WesternSign {
  name: string;
  symbol: string;          // unicode glyph, e.g. ♌
  dates: string;           // human-readable range
  element: "Fire" | "Earth" | "Air" | "Water";
  modality: "Cardinal" | "Fixed" | "Mutable";
  ruler: string;
  traits: string[];
  strength: string;
  watchOut: string;
  luckyNumbers: number[];
  luckyColors: LuckyColor[];
  luckyDay: string;
  gemstone: string;
  bestMatches: string[];
  blurb: string;
  /** Stylised constellation drawn in a 110 × 70 viewBox */
  stars: [number, number][];
  lines: [number, number][];
}

export interface ChineseSign {
  name: string;
  char: string;            // 鼠, 牛, 虎 …
  emoji: string;
  traits: string[];
  strength: string;
  watchOut: string;
  luckyNumbers: number[];
  luckyColors: LuckyColor[];
  luckyFlower: string;
  blurb: string;
}

export type YearRelation =
  | "Ben Ming Nian" | "Six Harmony" | "Trine Ally" | "Clash" | "Neutral";

export interface YearOutlook {
  year: number;
  yearAnimal: string;
  yearElement: string;
  relation: YearRelation;
  label: string;           // short badge text
  note: string;            // one-line reading
  tone: "great" | "good" | "neutral" | "caution";
}

export interface ZodiacProfile {
  dobLabel: string;
  age: number | null;
  western: WesternSign;
  chinese: ChineseSign;
  chineseYear: number;     // lunar year the birthday falls in
  element: string;         // Wood / Fire / Earth / Metal / Water
  polarity: "Yang" | "Yin";
  stemBranch: string;      // e.g. "Metal Horse 庚午"
  outlook: YearOutlook;
  bestMatchAnimals: string[];
  clashAnimal: string;
  horoscope: string;       // composed reading paragraph
}

/* ── Date parsing ──────────────────────────────────────────────────────── */

interface YMD { y: number; m: number; d: number; }

function parseDob(value?: string | null): YMD | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
  const fallback = new Date(value);
  if (isNaN(fallback.getTime())) return null;
  return { y: fallback.getFullYear(), m: fallback.getMonth() + 1, d: fallback.getDate() };
}

/* ── Western zodiac ────────────────────────────────────────────────────── */

const ELEMENT_GRADIENT: Record<WesternSign["element"], string> = {
  Fire:  "from-orange-500 via-rose-500 to-amber-400",
  Earth: "from-emerald-700 via-teal-600 to-lime-500",
  Air:   "from-sky-500 via-indigo-500 to-violet-400",
  Water: "from-blue-700 via-cyan-600 to-teal-400",
};
export function elementGradient(el: WesternSign["element"]) { return ELEMENT_GRADIENT[el]; }

/** Sign start dates, in calendar order. A birthday belongs to the last entry it is on/after. */
const WESTERN: (WesternSign & { startMonth: number; startDay: number })[] = [
  {
    startMonth: 1, startDay: 20,
    name: "Aquarius", symbol: "♒", dates: "Jan 20 – Feb 18",
    element: "Air", modality: "Fixed", ruler: "Uranus / Saturn",
    traits: ["Independent", "Inventive", "Humanitarian", "Level-headed"],
    strength: "Solves problems her own way and stays calm in a crisis.",
    watchOut: "Values her own space — dislikes being micro-managed.",
    luckyNumbers: [4, 7, 11, 22],
    luckyColors: [{ name: "Electric Blue", hex: "#2f6fed" }, { name: "Silver", hex: "#c0c4cc" }],
    luckyDay: "Saturday", gemstone: "Amethyst",
    bestMatches: ["Gemini", "Libra", "Sagittarius"],
    blurb: "Aquarius brings an inventive, unflappable temperament and a strong sense of fairness to a household.",
    stars: [[14, 34], [32, 22], [50, 36], [68, 22], [86, 36], [100, 24]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  {
    startMonth: 2, startDay: 19,
    name: "Pisces", symbol: "♓", dates: "Feb 19 – Mar 20",
    element: "Water", modality: "Mutable", ruler: "Neptune / Jupiter",
    traits: ["Compassionate", "Intuitive", "Gentle", "Adaptable"],
    strength: "Reads a room quickly — natural with children and the elderly.",
    watchOut: "Takes criticism to heart; responds best to gentle correction.",
    luckyNumbers: [3, 9, 12, 16],
    luckyColors: [{ name: "Sea Green", hex: "#2e9e8f" }, { name: "Lilac", hex: "#b4a7e6" }],
    luckyDay: "Thursday", gemstone: "Aquamarine",
    bestMatches: ["Cancer", "Scorpio", "Taurus"],
    blurb: "Pisces is the softest-hearted sign of the wheel — warm, patient and quietly devoted to the people in her care.",
    stars: [[14, 20], [30, 32], [50, 40], [70, 32], [88, 20], [56, 58], [82, 56]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]],
  },
  {
    startMonth: 3, startDay: 21,
    name: "Aries", symbol: "♈", dates: "Mar 21 – Apr 19",
    element: "Fire", modality: "Cardinal", ruler: "Mars",
    traits: ["Energetic", "Direct", "Courageous", "Quick-starting"],
    strength: "Gets moving without being told twice; high stamina.",
    watchOut: "Impatient with slow routines — give her the goal, not every step.",
    luckyNumbers: [1, 8, 9, 17],
    luckyColors: [{ name: "Red", hex: "#d63b3b" }, { name: "Scarlet", hex: "#f05a3c" }],
    luckyDay: "Tuesday", gemstone: "Diamond",
    bestMatches: ["Leo", "Sagittarius", "Gemini"],
    blurb: "Aries works at pace and takes initiative — the sign most likely to finish the list before lunch.",
    stars: [[18, 48], [38, 38], [58, 26], [78, 20], [96, 30]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    startMonth: 4, startDay: 20,
    name: "Taurus", symbol: "♉", dates: "Apr 20 – May 20",
    element: "Earth", modality: "Fixed", ruler: "Venus",
    traits: ["Reliable", "Patient", "Hard-working", "Home-loving"],
    strength: "Steady and long-staying — rarely breaks a contract.",
    watchOut: "Slow to change a routine once it is set.",
    luckyNumbers: [2, 6, 9, 24],
    luckyColors: [{ name: "Green", hex: "#3f9c5a" }, { name: "Rose Pink", hex: "#e08fa4" }],
    luckyDay: "Friday", gemstone: "Emerald",
    bestMatches: ["Virgo", "Capricorn", "Cancer"],
    blurb: "Taurus is the dependable, home-centred sign — dependable hands, an even temper and real staying power.",
    stars: [[20, 18], [40, 32], [60, 46], [80, 30], [100, 16]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    startMonth: 5, startDay: 21,
    name: "Gemini", symbol: "♊", dates: "May 21 – Jun 20",
    element: "Air", modality: "Mutable", ruler: "Mercury",
    traits: ["Communicative", "Quick-witted", "Versatile", "Sociable"],
    strength: "Picks up languages and new instructions fast.",
    watchOut: "Likes variety — repetitive tasks need a little rotation.",
    luckyNumbers: [5, 7, 14, 23],
    luckyColors: [{ name: "Yellow", hex: "#e8b93a" }, { name: "Light Blue", hex: "#69b7e8" }],
    luckyDay: "Wednesday", gemstone: "Agate",
    bestMatches: ["Libra", "Aquarius", "Aries"],
    blurb: "Gemini learns fast and talks well — usually the quickest of the signs to settle into a new household.",
    stars: [[22, 14], [26, 40], [32, 62], [76, 12], [82, 38], [90, 60]],
    lines: [[0, 1], [1, 2], [3, 4], [4, 5], [1, 4]],
  },
  {
    startMonth: 6, startDay: 21,
    name: "Cancer", symbol: "♋", dates: "Jun 21 – Jul 22",
    element: "Water", modality: "Cardinal", ruler: "Moon",
    traits: ["Nurturing", "Loyal", "Protective", "Domestic"],
    strength: "The classic care-giving sign — excellent with new-borns.",
    watchOut: "Home-sick early on; a warm welcome pays off.",
    luckyNumbers: [2, 3, 15, 20],
    luckyColors: [{ name: "White", hex: "#f2f2f2" }, { name: "Silver", hex: "#c8cdd4" }],
    luckyDay: "Monday", gemstone: "Pearl",
    bestMatches: ["Scorpio", "Pisces", "Taurus"],
    blurb: "Cancer is ruled by the Moon and built for the home — protective, affectionate and deeply loyal to a family.",
    stars: [[34, 22], [56, 36], [84, 24], [62, 60]],
    lines: [[0, 1], [1, 2], [1, 3]],
  },
  {
    startMonth: 7, startDay: 23,
    name: "Leo", symbol: "♌", dates: "Jul 23 – Aug 22",
    element: "Fire", modality: "Fixed", ruler: "Sun",
    traits: ["Warm", "Confident", "Generous", "Proud of her work"],
    strength: "Takes pride in a job well done and shows genuine warmth.",
    watchOut: "Responds to praise; blunt public correction stings.",
    luckyNumbers: [1, 4, 10, 19],
    luckyColors: [{ name: "Gold", hex: "#d4a017" }, { name: "Orange", hex: "#ee7f2d" }],
    luckyDay: "Sunday", gemstone: "Ruby",
    bestMatches: ["Aries", "Sagittarius", "Libra"],
    blurb: "Leo brings sunshine into a house — generous, big-hearted and visibly proud of doing things properly.",
    stars: [[16, 40], [24, 24], [40, 18], [54, 26], [50, 44], [78, 52], [96, 30]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 6]],
  },
  {
    startMonth: 8, startDay: 23,
    name: "Virgo", symbol: "♍", dates: "Aug 23 – Sep 22",
    element: "Earth", modality: "Mutable", ruler: "Mercury",
    traits: ["Meticulous", "Organised", "Practical", "Health-conscious"],
    strength: "Detail and cleanliness — the tidiest sign of the twelve.",
    watchOut: "A perfectionist; can be hard on herself.",
    luckyNumbers: [3, 5, 14, 20],
    luckyColors: [{ name: "Navy", hex: "#2c4a7c" }, { name: "Grey", hex: "#9aa3ad" }],
    luckyDay: "Wednesday", gemstone: "Sapphire",
    bestMatches: ["Taurus", "Capricorn", "Cancer"],
    blurb: "Virgo is the housekeeping sign — systematic, spotless and quietly thorough about the details others miss.",
    stars: [[14, 30], [34, 40], [52, 34], [70, 44], [90, 28], [58, 58]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]],
  },
  {
    startMonth: 9, startDay: 23,
    name: "Libra", symbol: "♎", dates: "Sep 23 – Oct 22",
    element: "Air", modality: "Cardinal", ruler: "Venus",
    traits: ["Diplomatic", "Even-tempered", "Cooperative", "Tidy-minded"],
    strength: "Keeps the peace — works smoothly alongside other helpers.",
    watchOut: "Avoids conflict, so ask directly if something is wrong.",
    luckyNumbers: [4, 6, 13, 24],
    luckyColors: [{ name: "Pastel Pink", hex: "#eaa6b8" }, { name: "Jade", hex: "#4fae94" }],
    luckyDay: "Friday", gemstone: "Opal",
    bestMatches: ["Gemini", "Aquarius", "Leo"],
    blurb: "Libra keeps a household harmonious — courteous, balanced and easy to live alongside.",
    stars: [[20, 46], [42, 24], [72, 22], [94, 44], [56, 52]],
    lines: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 2]],
  },
  {
    startMonth: 10, startDay: 23,
    name: "Scorpio", symbol: "♏", dates: "Oct 23 – Nov 21",
    element: "Water", modality: "Fixed", ruler: "Pluto / Mars",
    traits: ["Determined", "Discreet", "Resourceful", "Fiercely loyal"],
    strength: "Trustworthy with privacy and money; finishes what she starts.",
    watchOut: "Private by nature — takes time to open up.",
    luckyNumbers: [8, 11, 18, 22],
    luckyColors: [{ name: "Deep Red", hex: "#8f2233" }, { name: "Black", hex: "#33373d" }],
    luckyDay: "Tuesday", gemstone: "Topaz",
    bestMatches: ["Cancer", "Pisces", "Capricorn"],
    blurb: "Scorpio is intensely loyal and utterly discreet — the sign you trust with the keys and the household's business.",
    stars: [[14, 20], [30, 26], [46, 34], [62, 44], [78, 54], [92, 44], [98, 26]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    startMonth: 11, startDay: 22,
    name: "Sagittarius", symbol: "♐", dates: "Nov 22 – Dec 21",
    element: "Fire", modality: "Mutable", ruler: "Jupiter",
    traits: ["Optimistic", "Honest", "Cheerful", "Adventurous"],
    strength: "Bright, upbeat presence; adapts well to a move abroad.",
    watchOut: "Very frank — means no offence by plain speaking.",
    luckyNumbers: [3, 7, 9, 21],
    luckyColors: [{ name: "Purple", hex: "#7b4fb5" }, { name: "Turquoise", hex: "#3fbfb4" }],
    luckyDay: "Thursday", gemstone: "Turquoise",
    bestMatches: ["Aries", "Leo", "Aquarius"],
    blurb: "Sagittarius travels well and stays cheerful — an honest, optimistic worker who settles quickly overseas.",
    stars: [[18, 50], [30, 28], [52, 20], [74, 26], [88, 46], [66, 54], [40, 52]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]],
  },
  {
    startMonth: 12, startDay: 22,
    name: "Capricorn", symbol: "♑", dates: "Dec 22 – Jan 19",
    element: "Earth", modality: "Cardinal", ruler: "Saturn",
    traits: ["Disciplined", "Responsible", "Ambitious", "Frugal"],
    strength: "Strong work ethic and excellent time-keeping.",
    watchOut: "Serious-minded; needs rest days actually taken.",
    luckyNumbers: [4, 8, 13, 22],
    luckyColors: [{ name: "Brown", hex: "#8a6242" }, { name: "Charcoal", hex: "#4a4f57" }],
    luckyDay: "Saturday", gemstone: "Garnet",
    bestMatches: ["Taurus", "Virgo", "Scorpio"],
    blurb: "Capricorn is the most disciplined sign — punctual, thrifty and serious about her responsibilities.",
    stars: [[16, 26], [46, 18], [80, 32], [96, 50], [58, 54], [28, 44]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
];

function westernFor({ m, d }: YMD): WesternSign {
  // Walk backwards to the first start date on/before the birthday.
  for (let i = WESTERN.length - 1; i >= 0; i--) {
    const s = WESTERN[i];
    if (m > s.startMonth || (m === s.startMonth && d >= s.startDay)) return s;
  }
  // Jan 1 – Jan 19 falls before Aquarius' start → previous year's Capricorn
  return WESTERN[WESTERN.length - 1];
}

/* ── Chinese zodiac ────────────────────────────────────────────────────── */

/** Gregorian date of Chinese New Year, [month, day], 1924 – 2044. */
const CNY_DATES: Record<number, [number, number]> = {
  1924: [2, 5],  1925: [1, 24], 1926: [2, 13], 1927: [2, 2],  1928: [1, 23],
  1929: [2, 10], 1930: [1, 30], 1931: [2, 17], 1932: [2, 6],  1933: [1, 26],
  1934: [2, 14], 1935: [2, 4],  1936: [1, 24], 1937: [2, 11], 1938: [1, 31],
  1939: [2, 19], 1940: [2, 8],  1941: [1, 27], 1942: [2, 15], 1943: [2, 5],
  1944: [1, 25], 1945: [2, 13], 1946: [2, 2],  1947: [1, 22], 1948: [2, 10],
  1949: [1, 29], 1950: [2, 17], 1951: [2, 6],  1952: [1, 27], 1953: [2, 14],
  1954: [2, 3],  1955: [1, 24], 1956: [2, 12], 1957: [1, 31], 1958: [2, 18],
  1959: [2, 8],  1960: [1, 28], 1961: [2, 15], 1962: [2, 5],  1963: [1, 25],
  1964: [2, 13], 1965: [2, 2],  1966: [1, 21], 1967: [2, 9],  1968: [1, 30],
  1969: [2, 17], 1970: [2, 6],  1971: [1, 27], 1972: [2, 15], 1973: [2, 3],
  1974: [1, 23], 1975: [2, 11], 1976: [1, 31], 1977: [2, 18], 1978: [2, 7],
  1979: [1, 28], 1980: [2, 16], 1981: [2, 5],  1982: [1, 25], 1983: [2, 13],
  1984: [2, 2],  1985: [2, 20], 1986: [2, 9],  1987: [1, 29], 1988: [2, 17],
  1989: [2, 6],  1990: [1, 27], 1991: [2, 15], 1992: [2, 4],  1993: [1, 23],
  1994: [2, 10], 1995: [1, 31], 1996: [2, 19], 1997: [2, 7],  1998: [1, 28],
  1999: [2, 16], 2000: [2, 5],  2001: [1, 24], 2002: [2, 12], 2003: [2, 1],
  2004: [1, 22], 2005: [2, 9],  2006: [1, 29], 2007: [2, 18], 2008: [2, 7],
  2009: [1, 26], 2010: [2, 14], 2011: [2, 3],  2012: [1, 23], 2013: [2, 10],
  2014: [1, 31], 2015: [2, 19], 2016: [2, 8],  2017: [1, 28], 2018: [2, 16],
  2019: [2, 5],  2020: [1, 25], 2021: [2, 12], 2022: [2, 1],  2023: [1, 22],
  2024: [2, 10], 2025: [1, 29], 2026: [2, 17], 2027: [2, 6],  2028: [1, 26],
  2029: [2, 13], 2030: [2, 3],  2031: [1, 23], 2032: [2, 11], 2033: [1, 31],
  2034: [2, 19], 2035: [2, 8],  2036: [1, 28], 2037: [2, 15], 2038: [2, 4],
  2039: [1, 24], 2040: [2, 12], 2041: [2, 1],  2042: [1, 22], 2043: [2, 10],
  2044: [1, 30],
};

/** The lunar year a Gregorian date belongs to (rolls back if before that year's CNY). */
function lunarYear({ y, m, d }: YMD): number {
  // Outside the table, fall back to Lichun (≈ Feb 4), the solar-term convention.
  const [cm, cd] = CNY_DATES[y] ?? [2, 4];
  return (m < cm || (m === cm && d < cd)) ? y - 1 : y;
}

/** Order matters — index 0 must be Rat, matching (year − 4) mod 12. */
const CHINESE: ChineseSign[] = [
  {
    name: "Rat", char: "鼠", emoji: "🐀",
    traits: ["Resourceful", "Thrifty", "Quick", "Adaptable"],
    strength: "Clever with money and quick to spot what needs doing.",
    watchOut: "Restless if under-occupied.",
    luckyNumbers: [2, 3], luckyColors: [{ name: "Blue", hex: "#3c6fd1" }, { name: "Gold", hex: "#d4a017" }],
    luckyFlower: "Lily",
    blurb: "The Rat is the shrewdest of the signs — thrifty, alert and never wasteful.",
  },
  {
    name: "Ox", char: "牛", emoji: "🐂",
    traits: ["Diligent", "Dependable", "Patient", "Strong"],
    strength: "Tireless worker; the classic long-stay employee.",
    watchOut: "Stubborn once she has decided how a thing is done.",
    luckyNumbers: [1, 4], luckyColors: [{ name: "White", hex: "#eceff3" }, { name: "Yellow", hex: "#e8b93a" }],
    luckyFlower: "Tulip",
    blurb: "The Ox is honest, uncomplaining and immensely hard-working — luck earned through effort.",
  },
  {
    name: "Tiger", char: "虎", emoji: "🐅",
    traits: ["Brave", "Confident", "Protective", "Energetic"],
    strength: "Fearless and protective of the family in her charge.",
    watchOut: "Strong-willed; prefers respect to orders.",
    luckyNumbers: [1, 3, 4], luckyColors: [{ name: "Blue", hex: "#3c6fd1" }, { name: "Orange", hex: "#ee7f2d" }],
    luckyFlower: "Cineraria",
    blurb: "The Tiger carries courage and authority — a bold, protective presence in the home.",
  },
  {
    name: "Rabbit", char: "兔", emoji: "🐇",
    traits: ["Gentle", "Courteous", "Careful", "Peace-loving"],
    strength: "Soft-spoken and careful — very good with small children.",
    watchOut: "Avoids confrontation; may not raise problems early.",
    luckyNumbers: [3, 4, 6], luckyColors: [{ name: "Pink", hex: "#eaa6b8" }, { name: "Purple", hex: "#7b4fb5" }],
    luckyFlower: "Snapdragon",
    blurb: "The Rabbit is the gentlest sign — quiet, elegant and a naturally calming influence.",
  },
  {
    name: "Dragon", char: "龍", emoji: "🐉",
    traits: ["Charismatic", "Ambitious", "Lucky", "Energetic"],
    strength: "Traditionally the most auspicious sign — strong vitality.",
    watchOut: "Proud; does her best work when trusted.",
    luckyNumbers: [1, 6, 7], luckyColors: [{ name: "Gold", hex: "#d4a017" }, { name: "Silver", hex: "#c0c4cc" }],
    luckyFlower: "Bleeding-heart Vine",
    blurb: "The Dragon is the most fortunate sign in the cycle — vigorous, lucky and full of drive.",
  },
  {
    name: "Snake", char: "蛇", emoji: "🐍",
    traits: ["Wise", "Composed", "Private", "Perceptive"],
    strength: "Calm judgement and real discretion.",
    watchOut: "Keeps her own counsel — check in regularly.",
    luckyNumbers: [2, 8, 9], luckyColors: [{ name: "Red", hex: "#d63b3b" }, { name: "Light Yellow", hex: "#f0d98c" }],
    luckyFlower: "Orchid",
    blurb: "The Snake is quietly wise — observant, self-possessed and rarely flustered.",
  },
  {
    name: "Horse", char: "馬", emoji: "🐎",
    traits: ["Cheerful", "Energetic", "Independent", "Warm"],
    strength: "High energy and a sunny, sociable manner.",
    watchOut: "Needs freedom of movement; dislikes being confined.",
    luckyNumbers: [2, 3, 7], luckyColors: [{ name: "Yellow", hex: "#e8b93a" }, { name: "Green", hex: "#3f9c5a" }],
    luckyFlower: "Calla Lily",
    blurb: "The Horse is bright and tireless — a warm, active presence who keeps a house moving.",
  },
  {
    name: "Goat", char: "羊", emoji: "🐐",
    traits: ["Kind", "Artistic", "Calm", "Caring"],
    strength: "Tender-hearted; excellent with the elderly.",
    watchOut: "Sensitive to a harsh tone.",
    luckyNumbers: [3, 4, 9], luckyColors: [{ name: "Green", hex: "#3f9c5a" }, { name: "Red", hex: "#d63b3b" }],
    luckyFlower: "Carnation",
    blurb: "The Goat is mild and kind-hearted — patient care-giving is her natural strength.",
  },
  {
    name: "Monkey", char: "猴", emoji: "🐒",
    traits: ["Clever", "Lively", "Inventive", "Curious"],
    strength: "Learns new appliances and routines almost instantly.",
    watchOut: "Bored by pure repetition.",
    luckyNumbers: [1, 7, 8], luckyColors: [{ name: "White", hex: "#eceff3" }, { name: "Blue", hex: "#3c6fd1" }],
    luckyFlower: "Chrysanthemum",
    blurb: "The Monkey is the quickest study of the twelve — inventive, lively and endlessly capable.",
  },
  {
    name: "Rooster", char: "雞", emoji: "🐓",
    traits: ["Punctual", "Observant", "Neat", "Frank"],
    strength: "Time-keeping and tidiness are second nature.",
    watchOut: "Speaks plainly — no offence intended.",
    luckyNumbers: [5, 7, 8], luckyColors: [{ name: "Gold", hex: "#d4a017" }, { name: "Brown", hex: "#8a6242" }],
    luckyFlower: "Gladiola",
    blurb: "The Rooster is punctual and immaculate — nothing out of place, nothing forgotten.",
  },
  {
    name: "Dog", char: "狗", emoji: "🐕",
    traits: ["Loyal", "Honest", "Protective", "Sincere"],
    strength: "The most trustworthy sign — deeply loyal to a family.",
    watchOut: "Worries; reassurance settles her.",
    luckyNumbers: [3, 4, 9], luckyColors: [{ name: "Red", hex: "#d63b3b" }, { name: "Green", hex: "#3f9c5a" }],
    luckyFlower: "Rose",
    blurb: "The Dog is loyalty itself — honest, protective and utterly reliable with a household.",
  },
  {
    name: "Pig", char: "豬", emoji: "🐖",
    traits: ["Generous", "Easy-going", "Diligent", "Honest"],
    strength: "Good-natured and steady; brings prosperity in tradition.",
    watchOut: "Too accommodating — may not ask for help.",
    luckyNumbers: [2, 5, 8], luckyColors: [{ name: "Yellow", hex: "#e8b93a" }, { name: "Grey", hex: "#9aa3ad" }],
    luckyFlower: "Hydrangea",
    blurb: "The Pig is warm-hearted and content — traditionally a sign of comfort and abundance.",
  },
];

const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"] as const;
const ELEMENT_HEX: Record<string, string> = {
  Wood: "#3f9c5a", Fire: "#d64545", Earth: "#b8853f", Metal: "#9aa3ad", Water: "#3c6fd1",
};
export function elementHex(el: string) { return ELEMENT_HEX[el] ?? "#9aa3ad"; }

/** Heavenly-stem element: two consecutive years share one element. */
function yearElement(y: number) { return ELEMENTS[Math.floor((((y - 4) % 10) + 10) % 10 / 2)]; }
function yearAnimalIndex(y: number) { return (((y - 4) % 12) + 12) % 12; }
function yearPolarity(y: number): "Yang" | "Yin" { return y % 2 === 0 ? "Yang" : "Yin"; }

/** 三合 — the four trine groups of mutually supportive animals. */
const TRINES = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]];
/** 六合 — the six harmony pairs. */
const HARMONY: Record<number, number> = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };

function relationTo(a: number, b: number): YearRelation {
  if (a === b) return "Ben Ming Nian";
  if (HARMONY[a] === b) return "Six Harmony";
  if ((a - b + 12) % 12 === 6) return "Clash";
  if (TRINES.some((t) => t.includes(a) && t.includes(b))) return "Trine Ally";
  return "Neutral";
}

const RELATION_COPY: Record<YearRelation, { label: string; tone: YearOutlook["tone"]; note: string }> = {
  "Ben Ming Nian": {
    label: "本命年 · Zodiac Year", tone: "caution",
    note: "Her own zodiac year — tradition calls for extra care and wearing red for protection.",
  },
  "Six Harmony": {
    label: "六合 · Harmony Year", tone: "great",
    note: "A six-harmony year — considered one of the most fortunate pairings for settling into a new home.",
  },
  "Trine Ally": {
    label: "三合 · Trine Year", tone: "good",
    note: "A trine year — supportive energy, favourable for new work and smooth relations.",
  },
  Clash: {
    label: "六冲 · Clash Year", tone: "caution",
    note: "A clash year (沖太歲) — tradition advises a steady pace and a red charm for protection.",
  },
  Neutral: {
    label: "平 · Steady Year", tone: "neutral",
    note: "A steady, unremarkable year — fortune follows her own effort rather than the calendar.",
  },
};

export function relationTone(tone: YearOutlook["tone"]) {
  return {
    great:   { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500" },
    good:    { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-800",     dot: "bg-sky-500" },
    neutral: { bg: "bg-gray-50",    border: "border-gray-200",    text: "text-gray-700",    dot: "bg-gray-400" },
    caution: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   dot: "bg-amber-500" },
  }[tone];
}

/* ── Public entry point ────────────────────────────────────────────────── */

/**
 * Build the full profile for a date of birth.
 * `today` is injectable so the "this year" outlook can be tested or frozen.
 */
export function getZodiacProfile(dob?: string | null, today: Date = new Date()): ZodiacProfile | null {
  const ymd = parseDob(dob);
  if (!ymd) return null;

  const western = westernFor(ymd);

  const cy       = lunarYear(ymd);
  const animalIx = yearAnimalIndex(cy);
  const chinese  = CHINESE[animalIx];
  const element  = yearElement(cy);
  const polarity = yearPolarity(cy);

  // Current lunar year, so Jan–Feb sits in the right animal too
  const nowYmd    = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
  const currentCy = lunarYear(nowYmd);
  const currentIx = yearAnimalIndex(currentCy);
  const relation  = relationTo(animalIx, currentIx);
  const copy      = RELATION_COPY[relation];

  // Age at today's date, correcting for a birthday that has not come round yet
  let age = nowYmd.y - ymd.y;
  if (nowYmd.m < ymd.m || (nowYmd.m === ymd.m && nowYmd.d < ymd.d)) age -= 1;

  const trine = TRINES.find((t) => t.includes(animalIx))!;
  const bestMatchAnimals = [
    ...trine.filter((i) => i !== animalIx).map((i) => CHINESE[i].name),
    CHINESE[HARMONY[animalIx]].name,
  ];

  const dobLabel = `${String(ymd.d).padStart(2, "0")}/${String(ymd.m).padStart(2, "0")}/${ymd.y}`;

  return {
    dobLabel,
    age: age >= 0 && age < 130 ? age : null,
    western,
    chinese,
    chineseYear: cy,
    element,
    polarity,
    stemBranch: `${element} ${chinese.name} ${chinese.char}`,
    outlook: {
      year: currentCy,
      yearAnimal: CHINESE[currentIx].name,
      yearElement: yearElement(currentCy),
      relation,
      label: copy.label,
      note: copy.note,
      tone: copy.tone,
    },
    bestMatchAnimals,
    clashAnimal: CHINESE[(animalIx + 6) % 12].name,
    horoscope:
      `${western.blurb} Born in the year of the ${element} ${chinese.name}, ` +
      `${chinese.blurb.charAt(0).toLowerCase() + chinese.blurb.slice(1)} ` +
      `Together the pair reads as ${western.traits[0].toLowerCase()} and ` +
      `${chinese.traits[0].toLowerCase()} — ${western.strength.charAt(0).toLowerCase() + western.strength.slice(1)}`,
  };
}
