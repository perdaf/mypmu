"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toPmuDate } from "@/lib/date";

export function DateForm() {
  const router = useRouter();
  const [date, setDate] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date) router.push(`/reunions/${toPmuDate(date)}`);
  }

  return (
    <form className="dateForm" onSubmit={submit}>
      <label htmlFor="race-date">Date des courses</label>
      <div className="dateControls">
        <input
          id="race-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        <button type="submit">Analyser le programme</button>
      </div>
    </form>
  );
}
