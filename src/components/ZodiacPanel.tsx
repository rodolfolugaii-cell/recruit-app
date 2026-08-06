"use client";

import { useMemo } from "react";
import {
  getZodiacProfile, elementGradient, elementHex, relationTone,
  type ZodiacProfile, type LuckyColor, type WesternSign,
} from "@/lib/zodiac";

/* ── Small building blocks ─────────────────────────────────────────────── */

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block text-[10px] leading-none px-2 py-1 rounded-full font-medium ${className}`}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-1.5">{children}</p>
  );
}

function Swatches({ colors }: { colors: LuckyColor[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <span key={c.name} className="flex items-center gap-1 text-[10px] text-gray-600">
          <span
            className="w-3 h-3 rounded-full border border-black/15 shadow-inner flex-shrink-0"
            style={{ backgroundColor: c.hex }}
          />
          {c.name}
        </span>
      ))}
    </div>
  );
}

function LuckyNumbers({ numbers, hex }: { numbers: number[]; hex: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {numbers.map((n) => (
        <span
          key={n}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: hex }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

/** Stylised constellation for the banner backdrop. */
function Constellation({ sign }: { sign: WesternSign }) {
  return (
    <svg viewBox="0 0 110 70" className="absolute inset-y-0 right-0 h-full w-auto opacity-45" aria-hidden="true">
      {sign.lines.map(([a, b], i) => (
        <line
          key={i}
          x1={sign.stars[a][0]} y1={sign.stars[a][1]}
          x2={sign.stars[b][0]} y2={sign.stars[b][1]}
          stroke="white" strokeWidth="0.6" strokeOpacity="0.75"
        />
      ))}
      {sign.stars.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="2.6" fill="white" opacity="0.22" />
          <circle cx={x} cy={y} r="1.15" fill="white" />
        </g>
      ))}
      {/* scattered background stars — fixed positions so the panel renders identically every time */}
      {[[8, 10], [96, 62], [22, 64], [70, 6], [46, 8], [104, 34]].map(([x, y], i) => (
        <circle key={`bg-${i}`} cx={x} cy={y} r="0.55" fill="white" opacity="0.6" />
      ))}
    </svg>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export default function ZodiacPanel({ dob, name }: { dob?: string | null; name?: string }) {
  const profile: ZodiacProfile | null = useMemo(() => getZodiacProfile(dob), [dob]);

  if (!profile) {
    return (
      <div className="p-5">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-2">Astrology &amp; Fortune</p>
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <div className="text-2xl mb-1">🔮</div>
          <p className="text-[11px] text-gray-500 leading-snug">
            No date of birth on file — add one to see {name ? `${name.split(" ")[0]}'s` : "the applicant's"} zodiac reading.
          </p>
        </div>
      </div>
    );
  }

  const { western, chinese, outlook } = profile;
  const tone      = relationTone(outlook.tone);
  const elHex     = elementHex(profile.element);
  const firstName = name?.trim().split(/\s+/)[0] ?? "She";

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-slate-50 to-white">
      {/* ── Panel heading ── */}
      <div className="flex items-baseline justify-between">
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.16em]">Astrology &amp; Fortune</p>
        <span className="text-[9px] text-gray-400">
          {profile.dobLabel}{profile.age !== null && ` · ${profile.age} yrs`}
        </span>
      </div>

      {/* ── Western zodiac banner ── */}
      <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${elementGradient(western.element)} text-white shadow-md`}>
        <Constellation sign={western} />
        <div className="relative p-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="text-4xl leading-none drop-shadow-sm"
              style={{ textShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
            >
              {western.symbol}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight tracking-wide">{western.name}</p>
              <p className="text-[10px] text-white/85 leading-tight">{western.dates}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-2.5">
            <Chip className="bg-white/25 text-white backdrop-blur-sm">{western.element}</Chip>
            <Chip className="bg-white/25 text-white backdrop-blur-sm">{western.modality}</Chip>
            <Chip className="bg-white/25 text-white backdrop-blur-sm">☉ {western.ruler}</Chip>
          </div>
        </div>
      </div>

      {/* ── Western traits ── */}
      <div>
        <Label>Sun Sign Traits</Label>
        <div className="flex flex-wrap gap-1">
          {western.traits.map((t) => (
            <Chip key={t} className="bg-slate-100 text-slate-700">{t}</Chip>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed mt-2">
          <span className="font-semibold text-gray-700">Strength · </span>{western.strength}
        </p>
        <p className="text-[11px] text-gray-600 leading-relaxed mt-1">
          <span className="font-semibold text-gray-700">Note · </span>{western.watchOut}
        </p>
      </div>

      {/* ── Western lucky block ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
        <Label>Lucky for {western.name}</Label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Numbers</span>
          <LuckyNumbers numbers={western.luckyNumbers} hex="#475569" />
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] text-gray-500 pt-0.5">Colours</span>
          <div className="text-right"><Swatches colors={western.luckyColors} /></div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Day</span>
          <span className="text-[10px] font-semibold text-gray-700">{western.luckyDay}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Gemstone</span>
          <span className="text-[10px] font-semibold text-gray-700">💎 {western.gemstone}</span>
        </div>
      </div>

      {/* ── Chinese zodiac banner ── */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-red-800 via-red-600 to-amber-500 text-white shadow-md">
        {/* Oversized Chinese character as a watermark */}
        <span
          className="absolute -right-2 -bottom-5 text-[86px] leading-none font-bold text-white/15 select-none pointer-events-none"
          aria-hidden="true"
        >
          {chinese.char}
        </span>
        <div className="relative p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-4xl leading-none drop-shadow-sm">{chinese.emoji}</span>
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight tracking-wide">
                {profile.element} {chinese.name}
              </p>
              <p className="text-[10px] text-white/85 leading-tight">
                Year of the {chinese.name} · {profile.chineseYear}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-2.5">
            <Chip className="bg-white/25 text-white backdrop-blur-sm">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: elHex }} />
              {profile.element} 五行
            </Chip>
            <Chip className="bg-white/25 text-white backdrop-blur-sm">{profile.polarity === "Yang" ? "☯ Yang 陽" : "☯ Yin 陰"}</Chip>
            <Chip className="bg-white/25 text-white backdrop-blur-sm">{chinese.char}</Chip>
          </div>
        </div>
      </div>

      {/* ── Chinese traits ── */}
      <div>
        <Label>Chinese Zodiac Traits</Label>
        <div className="flex flex-wrap gap-1">
          {chinese.traits.map((t) => (
            <Chip key={t} className="bg-red-50 text-red-800">{t}</Chip>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed mt-2">
          <span className="font-semibold text-gray-700">Strength · </span>{chinese.strength}
        </p>
        <p className="text-[11px] text-gray-600 leading-relaxed mt-1">
          <span className="font-semibold text-gray-700">Note · </span>{chinese.watchOut}
        </p>
      </div>

      {/* ── Chinese lucky block ── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
        <Label>Lucky for the {chinese.name}</Label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Numbers</span>
          <LuckyNumbers numbers={chinese.luckyNumbers} hex="#b91c1c" />
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] text-gray-500 pt-0.5">Colours</span>
          <div className="text-right"><Swatches colors={chinese.luckyColors} /></div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Flower</span>
          <span className="text-[10px] font-semibold text-gray-700">🌼 {chinese.luckyFlower}</span>
        </div>
      </div>

      {/* ── This year's outlook ── */}
      <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <Label>{outlook.year} Outlook</Label>
          <span className={`flex items-center gap-1 text-[9px] font-bold ${tone.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
            {outlook.label}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mb-1">
          {outlook.year} is the year of the {outlook.yearElement} {outlook.yearAnimal}.
        </p>
        <p className={`text-[11px] leading-relaxed ${tone.text}`}>{outlook.note}</p>
      </div>

      {/* ── Compatibility ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2.5">
        <div>
          <Label>Best Matched Signs</Label>
          <div className="flex flex-wrap gap-1">
            {profile.bestMatchAnimals.map((a) => (
              <Chip key={a} className="bg-emerald-50 text-emerald-800 border border-emerald-100">🀄 {a}</Chip>
            ))}
            {western.bestMatches.map((s) => (
              <Chip key={s} className="bg-indigo-50 text-indigo-800 border border-indigo-100">✦ {s}</Chip>
            ))}
          </div>
        </div>
        <div>
          <Label>Traditional Clash</Label>
          <Chip className="bg-gray-100 text-gray-600 border border-gray-200">⚡ {profile.clashAnimal}</Chip>
        </div>
      </div>

      {/* ── Composed reading ── */}
      <div className="rounded-lg bg-slate-800 text-slate-100 p-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1.5">
          Reading for {firstName}
        </p>
        <p className="text-[11px] leading-relaxed text-slate-200">{profile.horoscope}</p>
      </div>

      <p className="text-[9px] text-gray-400 leading-snug italic pt-0.5">
        Traditional astrology, shown for reference at the employer&apos;s request — not an assessment of
        the applicant&apos;s skills or suitability.
      </p>
    </div>
  );
}
