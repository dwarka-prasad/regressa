"use client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Standard easing used everywhere so motion feels like one system. */
export const ease = [0.22, 1, 0.36, 1] as const;

export function FadeIn({ children, delay = 0, y = 8, className, ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease }} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Staggers direct children (wrap each in <StaggerItem>). */
export function Stagger({ children, className, delay = 0, stagger = 0.06 }: { children: ReactNode; className?: string; delay?: number; stagger?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : "hidden"} animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 12, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease } } }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Card with a subtle lift on hover. */
export function HoverCard({ children, className = "", ...rest }: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div whileHover={{ y: -2, boxShadow: "0 18px 40px -22px rgb(15 23 42 / 0.35)" }} transition={{ duration: 0.2 }} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/**
 * Counts from 0 to `value` on mount with a spring. Renders the final formatted value on the server and on
 * first paint so tests and no-JS clients see the real number immediately.
 */
export function AnimatedNumber({ value, format = (v) => v.toLocaleString(), className }: { value: number; format?: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.8 });
  const [display, setDisplay] = useState(format(value));
  const first = useRef(true);
  useEffect(() => {
    if (reduce) { setDisplay(format(value)); return; }
    if (first.current) { first.current = false; mv.set(0); }
    mv.set(value);
    const unsub = spring.on("change", (v) => setDisplay(format(Math.abs(v - value) < 1e-9 ? value : v)));
    return unsub;
  }, [value, reduce, mv, spring, format]);
  return <span className={`tabular-nums ${className ?? ""}`}>{display}</span>;
}

/** Wraps route content: fades and slides on navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
      {children}
    </motion.div>
  );
}

/** Progress bar that animates to its width. */
export function Progress({ pct, tone = "brand", className = "" }: { pct: number; tone?: "brand" | "bad" | "ok"; className?: string }) {
  const color = tone === "bad" ? "bg-bad" : tone === "ok" ? "bg-ok" : "bg-brand";
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`}>
      <motion.div className={`h-full ${color}`} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.8, ease }} />
    </div>
  );
}

export { motion, useTransform };
