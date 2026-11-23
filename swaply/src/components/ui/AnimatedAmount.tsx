"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatAmount } from "@/lib/format";

/**
 * Counts up to a decimal-string amount. The animation is cosmetic: it always lands on and then
 * displays the exact backend value (never a float approximation).
 */
export function AnimatedAmount({ value, precision, locale, className, testId }: { value: string | null; precision: number; locale: "uk" | "en"; className?: string; testId?: string }) {
  const reduce = useReducedMotion();
  const [text, setText] = useState(value ? formatAmount(value, precision, locale) : "—");
  const prev = useRef<number>(0);

  useEffect(() => {
    if (!value) {
      setText("—");
      prev.current = 0;
      return;
    }
    const exact = formatAmount(value, precision, locale);
    const target = Number(value);
    if (reduce || !Number.isFinite(target)) {
      setText(exact);
      prev.current = target;
      return;
    }
    const from = prev.current;
    const decimals = Math.min(precision, (value.split(".")[1] ?? "").length);
    const controls = animate(from, target, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setText(formatAmount(v.toFixed(decimals), precision, locale)),
      onComplete: () => setText(exact),
    });
    prev.current = target;
    return () => controls.stop();
  }, [value, precision, locale, reduce]);

  return (
    <span className={className} data-testid={testId} data-value={value ?? ""}>
      {text}
    </span>
  );
}
