export default function GrowthLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <section className="grid gap-6 rounded-lg border border-white/10 bg-white/5 p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="h-4 w-44 rounded-full bg-white/10" />
          <div className="h-14 w-full max-w-3xl rounded-lg bg-white/10" />
          <div className="h-4 w-full max-w-2xl rounded-full bg-white/10" />
          <div className="h-4 w-5/6 max-w-xl rounded-full bg-white/10" />
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="h-5 w-40 rounded-full bg-white/10" />
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full rounded-full bg-white/10" />
            <div className="h-4 w-11/12 rounded-full bg-white/10" />
            <div className="h-4 w-4/5 rounded-full bg-white/10" />
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 rounded-lg border border-white/10 bg-white/5" />
        <div className="h-28 rounded-lg border border-white/10 bg-white/5" />
        <div className="h-28 rounded-lg border border-white/10 bg-white/5" />
        <div className="h-28 rounded-lg border border-white/10 bg-white/5" />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="h-80 rounded-lg border border-white/10 bg-white/5" />
        <div className="h-80 rounded-lg border border-white/10 bg-white/5" />
      </section>
    </div>
  );
}
