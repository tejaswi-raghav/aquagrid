"use client";

import { motion, useScroll, useSpring } from "motion/react";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return <motion.div aria-hidden="true" className="fixed inset-x-0 top-16 z-40 h-[3px] origin-left bg-[var(--color-yellow)]" style={{ scaleX }} />;
}

const CARDS = [
  {
    href: "/plant",
    title: "Inside the desalination plant",
    body: "Take the reverse-osmosis plant apart stage by stage and watch what every extra cubic metre costs in electricity.",
    cta: "Explore the plant",
    art: (
      <svg viewBox="0 0 320 140" className="h-full w-full" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.g key={i} initial={{ y: 0 }} whileInView={{ y: i % 2 ? -10 : 0 }} transition={{ duration: 0.8, delay: i * 0.08 }} viewport={{ once: true }}>
            <rect x={14 + i * 50} y={58} width={38} height={34} rx="6" fill={i === 2 ? "#fff44f" : "#48cae4"} stroke="#03045e" strokeWidth="1.5" />
          </motion.g>
        ))}
        <path d="M8 75H312" stroke="#03045e" strokeWidth="3" strokeDasharray="6 8">
          <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.2s" repeatCount="indefinite" />
        </path>
      </svg>
    ),
  },
  {
    href: "/control",
    title: "Run the control room",
    body: "Trigger the 14:00 disruption on a live EPANET model, follow the evidence, and approve or reject what the AI proposes.",
    cta: "Enter the control room",
    art: (
      <svg viewBox="0 0 320 140" className="h-full w-full" aria-hidden="true">
        {[0, 1, 2].map((i) => <rect key={i} x={14 + i * 100} y={18} width={90} height={34} rx="8" fill="#48cae4" stroke={i === 1 ? "#b3001b" : "#0587a3"} />)}
        <polyline points="14,110 60,110 74,86 90,126 104,96 118,110 200,110 214,86 230,126 244,96 258,110 306,110" fill="none" stroke="#03045e" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="420">
          <animate attributeName="stroke-dashoffset" from="420" to="0" dur="2.4s" repeatCount="indefinite" />
        </polyline>
        <circle cx="160" cy="35" r="5" fill="#b3001b"><animate attributeName="opacity" values="1;.25;1" dur="1.4s" repeatCount="indefinite" /></circle>
      </svg>
    ),
  },
];

export function Explore() {
  return (
    <section aria-labelledby="explore-title" className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
      <h2 id="explore-title" className="type-h2 max-w-[20ch]">Saving electricity should never put a city’s water at risk.</h2>
      <p className="measure mt-5 text-[1.0625rem] leading-relaxed text-black/80">
        AquaGrid connects the evidence, tests the consequences before anything changes, and keeps a person in charge of every decision. Go deeper:
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {CARDS.map((c, i) => (
          <motion.a
            key={c.href}
            href={c.href}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            whileHover={{ y: -4 }}
            className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-navy-2)] transition-colors hover:border-[var(--color-yellow)]"
          >
            <div className="h-40 border-b border-[var(--color-line)] bg-[var(--color-navy)] p-4">{c.art}</div>
            <div className="flex flex-1 flex-col p-6">
              <h3 className="type-h3">{c.title}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-black/75">{c.body}</p>
              <span className="mt-5 inline-flex w-fit items-center rounded-full bg-[var(--color-yellow)] px-4 py-2 text-[14px] font-[660] text-black transition-colors group-hover:bg-white">{c.cta}</span>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
