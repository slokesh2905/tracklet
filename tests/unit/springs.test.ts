import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { cssTimeToMs, SPRINGS, springsCss, springToCss } from "@/lib/spring-css";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

function points(easing: string) {
  return easing.slice("linear(".length, -1).split(", ").map(Number);
}

describe("spring tokens", () => {
  it("app/springs.css is up to date (run `npm run gen:springs` after changing a spring)", () => {
    expect(read("app/springs.css")).toBe(springsCss());
  });

  it("are all critically damped: nothing in the stylesheet was thrown by a gesture", () => {
    for (const [name, params] of Object.entries(SPRINGS)) expect(params.damping, name).toBe(1);
  });

  it.each(Object.entries(SPRINGS))("%s never overshoots and ends exactly at 1", (_name, params) => {
    const p = points(springToCss(params).easing);
    expect(p[0]).toBe(0);
    expect(p.at(-1)).toBe(1);
    expect(Math.max(...p)).toBeLessThanOrEqual(1);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]!);
  });

  it("take as long as the spring takes to settle, and quicker springs settle sooner", () => {
    const d = (name: keyof typeof SPRINGS) => springToCss(SPRINGS[name]).durationMs;
    expect(d("press")).toBeGreaterThan(120);
    expect(d("press")).toBeLessThan(d("fast"));
    expect(d("fast")).toBeLessThan(d("base"));
    expect(d("base")).toBeLessThan(700);
  });

  it("front-loads the motion: well over half the travel in the first quarter of the time", () => {
    const p = points(springToCss(SPRINGS.base).easing);
    expect(p[Math.floor(p.length / 4)]).toBeGreaterThan(0.5);
  });
});

/** Every source file whose timing we own. */
function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) return sources(rel);
    return /\.(tsx?|css)$/.test(name) ? [rel.replace(/\\/g, "/")] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/\s.*$/gm, "");

/** Hand-set timing. Spring tokens (var(--spring-*)) are the only way to time motion. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ["cubic-bezier()", /cubic-bezier\(/],
  ["an easing keyword or ease-* class", /(?<![\w-])ease(-in-out|-in|-out|-enter|-exit|-linear)?(?![\w-])/],
  ["a duration-* or delay-* class", /(?<![\w-])(duration|delay)-\d/],
  ["a millisecond duration", /(?<![\w.-])\d+(\.\d+)?ms\b/],
];
/** A seconds literal, unless it's the period of an endless loop (a breathing skeleton, a spinner). */
const SECONDS = /(?<=[\s:(,])\d*\.?\d+s(?=[\s;,)"'\]]|$)/;

describe("cssTimeToMs", () => {
  it("reads both spellings the CSS minifier may produce", () => {
    expect(cssTimeToMs("565ms")).toBe(565);
    expect(cssTimeToMs(".565s")).toBeCloseTo(565);
    expect(cssTimeToMs(" 0.308s ")).toBeCloseTo(308);
    expect(cssTimeToMs("1s")).toBe(1000);
  });
});

describe("the guard itself", () => {
  const hit = (re: RegExp, text: string) => re.test(text);

  it("catches what it is meant to catch", () => {
    expect(hit(FORBIDDEN[0]![1], "transition: all 1s cubic-bezier(0.4, 0, 0.2, 1)")).toBe(true);
    expect(hit(FORBIDDEN[1]![1], "transition-timing-function: ease-out;")).toBe(true);
    expect(hit(FORBIDDEN[1]![1], 'className="transition ease-in-out"')).toBe(true);
    expect(hit(FORBIDDEN[2]![1], 'className="duration-200"')).toBe(true);
    expect(hit(FORBIDDEN[2]![1], 'className="data-[state=open]:delay-75"')).toBe(true);
    expect(hit(FORBIDDEN[3]![1], "transition-duration: 180ms;")).toBe(true);
    expect(hit(SECONDS, "animation: pulse 2s;")).toBe(true);
    expect(hit(SECONDS, "animation: fade .3s forwards")).toBe(true);
  });

  it("leaves the spring tokens, SVG paths and ordinary words alone", () => {
    expect(hit(FORBIDDEN[3]![1], "transition-duration: var(--spring-fast-duration);")).toBe(false);
    expect(hit(FORBIDDEN[1]![1], "to increase the price, release")).toBe(false);
    expect(hit(SECONDS, 'd="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07z"')).toBe(false);
    expect(hit(SECONDS, "const lows = 2")).toBe(false);
  });
});

describe("no hand-set easing or duration", () => {
  const files = ["app", "components", "lib"].flatMap(sources).filter((f) => f !== "app/springs.css");

  it("scans the source tree", () => expect(files.length).toBeGreaterThan(50));

  it.each(FORBIDDEN)("has no %s", (_label, pattern) => {
    const hits = files.flatMap((file) =>
      stripComments(read(file))
        .split("\n")
        .map((line, i) => ({ at: `${relative("", file)}:${i + 1}`, line: line.trim() }))
        .filter(({ line }) => pattern.test(line))
    );
    expect(hits).toEqual([]);
  });

  it("has no fixed duration in seconds, except the period of an infinite loop", () => {
    const hits = files.flatMap((file) =>
      stripComments(read(file))
        .split("\n")
        .map((line, i) => ({ at: `${file}:${i + 1}`, line: line.trim() }))
        .filter(({ line }) => SECONDS.test(line) && !/infinite/.test(line))
    );
    expect(hits).toEqual([]);
  });
});
