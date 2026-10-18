"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/** "Saturday, 17 October|evening" in the visitor's own clock, as one string so the snapshot is stable. */
function readNow() {
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}|${part}`;
}

/** The server doesn't know the visitor's time zone, so it renders a neutral hello and the client fills in the rest. */
export default function HomeGreeting({ name, summary }: { name: string; summary: string }) {
  const now = useSyncExternalStore(subscribeNothing, readNow, () => null);
  const [date, part] = now ? now.split("|") : [null, null];

  return (
    <header>
      <p className="h-[1.0625rem] text-[0.8125rem] text-muted-foreground">{date}</p>
      <h1 className="mt-0.5 text-[1.75rem] leading-tight font-bold tracking-tight md:mt-1 md:text-[2rem]">
        {part ? `Good ${part}, ${name}` : `Hello, ${name}`}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground md:mt-1.5 md:text-[0.9375rem]" suppressHydrationWarning>
        {summary}
      </p>
    </header>
  );
}
