export function DocsSteps({ steps }: { steps: { title: string; description: string }[] }) {
  return (
    <div className="my-6 space-y-0">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-4 relative">
          {/* Line connector */}
          {i < steps.length - 1 && (
            <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
          )}
          <div className="flex-shrink-0 size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center z-10">
            <span className="text-xs font-semibold text-primary">{i + 1}</span>
          </div>
          <div className="pb-8">
            <p className="text-sm font-semibold text-foreground mb-1">{step.title}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
