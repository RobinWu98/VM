"use client";

import { FormEvent, useState } from "react";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [stdin, setStdin] = useState("12\n34\n");
  const [output, setOutput] = useState("Run output will appear here.");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setOutput("Please select a .mi file first.");
      return;
    }

    const formData = new FormData();
    formData.append("program", file);
    formData.append("stdin", stdin);

    setLoading(true);
    setOutput("Running...");

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        body: formData
      });

      const data = (await response.json()) as { output?: string; error?: string };
      if (!response.ok) {
        setOutput(data.error ?? "Run failed.");
      } else {
        setOutput(data.output ?? "(no output)");
      }
    } catch {
      setOutput("Network error while calling /api/run");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>RISK-XVII Online Lab</h1>
      <p className="subtitle">Upload a .mi file, provide stdin, and run your VM in browser.</p>

      <form className="card grid" onSubmit={onSubmit}>
        <div className="grid">
          <label htmlFor="program">Program (.mi)</label>
          <input
            id="program"
            type="file"
            accept=".mi,application/octet-stream"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="hint">Try: examples/add_2_numbers/add_2_numbers.mi</p>
        </div>

        <div className="grid">
          <label htmlFor="stdin">Stdin</label>
          <textarea
            id="stdin"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="One input per line"
          />
        </div>

        <button type="submit" disabled={loading}>{loading ? "Running..." : "Run Program"}</button>
      </form>

      <section className="output" aria-live="polite">
        {output}
      </section>
    </main>
  );
}
