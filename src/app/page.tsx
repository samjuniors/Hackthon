export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <div className="border border-slate-800 bg-slate-900/60 backdrop-blur rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Milestone 0: Project Bootstrap (PROVISIONAL)
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Thermal Decision Engine
          </h1>
          <p className="text-slate-400 text-sm">
            FortyGuard Hackathon&apos;26 Submission &bull; Deadline: August 30, 2026
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Provisional Product Direction
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            AI-powered Thermal Decision Engine that transforms hyperlocal temperature intelligence into actionable, explainable operational decisions and what-if scenarios.
          </p>
          <p className="text-xs text-amber-400/90 font-mono">
            Notice: Final domain and capabilities remain PROVISIONAL pending FortyGuard API reconnaissance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
            <h3 className="text-sm font-medium text-slate-300 mb-1">Architecture Foundation</h3>
            <p className="text-xs text-slate-400">
              Next.js App Router, TypeScript, Tailwind CSS, Zod boundary validation, Vitest.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
            <h3 className="text-sm font-medium text-slate-300 mb-1">Authoritative Docs</h3>
            <p className="text-xs text-slate-400">
              Structured specification active in <code className="text-cyan-400">/docs</code> and <code className="text-cyan-400">INDEX.md</code>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
