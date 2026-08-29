function moduleTitle(module) {
  return module?.title || String(module?.type || 'Automation module').replace(/[-_]/g, ' ');
}

export default function AutomationModules({ manifest }) {
  const ui = manifest?.ui || { mode: 'generic', fallback: true, modules: [] };
  const modules = Array.isArray(ui.modules) ? ui.modules : [];
  if (!modules.length) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold capitalize text-slate-800">Automation workspace</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">This automation uses the compatible generic dashboard. Automation-specific modules can be added without changing the legacy settings and execution views.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {modules.map((module, index) => (
        <div key={`${module.type || 'module'}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold capitalize text-slate-800">{moduleTitle(module)}</h2>
          {module.description && <p className="mt-1 text-xs leading-5 text-slate-600">{module.description}</p>}
        </div>
      ))}
    </section>
  );
}
