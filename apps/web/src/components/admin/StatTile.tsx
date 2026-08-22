"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Sparkline from "./Sparkline";
import type { Delta } from "@/lib/metrics";

/**
 * KPI tile: label · value · delta vs a *named* period · 12-point sparkline.
 *
 * The delta colour is direction × whether up is good, not direction alone. That
 * is the whole reason `upIsGood` exists: "pending payments +40%" and "revenue
 * +40%" point the same way and mean opposite things, and a dashboard that paints
 * both green is actively lying. When there is no prior period to divide by, the
 * tile says "no prior period" rather than inventing a number.
 */
export default function StatTile({
  label,
  value,
  delta,
  trend,
  href,
  icon,
  attn = false,
  foot,
}: {
  label: string;
  value: string | number;
  delta?: Delta;
  trend?: number[];
  href?: string;
  icon?: React.ReactNode;
  /** Reserved for the one thing that needs acting on — not a "look at me" flag. */
  attn?: boolean;
  foot?: string;
}) {
  const dir = delta?.pct == null ? 0 : delta.pct > 0.5 ? 1 : delta.pct < -0.5 ? -1 : 0;
  const tone = dir === 0 ? "flat" : (dir > 0) === (delta?.upIsGood ?? true) ? "good" : "bad";
  const Arrow = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;

  const body = (
    <>
      <span className="admin-tile__label">
        {icon}
        {label}
      </span>
      <span className="admin-tile__row">
        <span className="admin-tile__value">{value}</span>
        {trend && trend.length > 1 && (
          <span className="admin-tile__spark">
            <Sparkline data={trend} label={`${label} over the last 30 days`} />
          </span>
        )}
      </span>
      <span className="admin-tile__foot">
        {delta ? (
          delta.pct == null ? (
            <span className="admin-delta admin-delta--flat">
              <Minus size={11} /> no prior period
            </span>
          ) : (
            <>
              <span className={`admin-delta admin-delta--${tone}`}>
                <Arrow size={11} />
                {dir === 0 ? "flat" : `${Math.abs(delta.pct).toFixed(Math.abs(delta.pct) < 10 ? 1 : 0)}%`}
              </span>
              vs {delta.period}
            </>
          )
        ) : (
          <span>{foot ?? ""}</span>
        )}
      </span>
    </>
  );

  const cls = `admin-tile ${attn ? "admin-tile--attn" : ""}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
