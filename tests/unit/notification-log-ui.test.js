const path = require('path');
const Module = require('module');
const frontend = path.resolve(__dirname, '../../frontend/dashboard');
const React = require(path.join(frontend, 'node_modules/react'));
const { renderToStaticMarkup } = require(path.join(frontend, 'node_modules/react-dom/server'));
const esbuild = require(path.join(frontend, 'node_modules/esbuild'));

test('the shared log renders one mailing-list section for every integration and applies read-only permissions', () => {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [path.join(frontend, 'src/components/ActivityPanel.jsx')], bundle: true,
    platform: 'node', format: 'cjs', write: false, jsx: 'automatic',
    external: ['react', 'react/*'], define: { 'import.meta.env.VITE_API_URL': '""' },
  });
  const compiled = new Module(path.join(frontend, 'notification-log-test.cjs'), module);
  compiled.filename = path.join(frontend, 'notification-log-test.cjs');
  compiled.paths = Module._nodeModulePaths(frontend);
  // Keep the component and renderer on Jest's same React module instance.
  compiled.require = (id) => require(path.join(frontend, 'node_modules', id));
  compiled._compile(outputFiles[0].text, compiled.filename);
  const ActivityPanel = compiled.exports.default;
  for (const integrationId of ['existing-automation', 'new-automation']) {
    // Server rendering never runs effects, fetches saved settings or contacts SES.
    const html = renderToStaticMarkup(React.createElement(ActivityPanel, { integrationId, executions: [], canManage: false }));
    expect(html.match(/aria-label="נמעני מייל"/g)).toHaveLength(1);
    expect(html).toContain('שליחת מייל ניסיון');
    expect(html).toContain('שמירה');
    const section = html.match(/<section[\s\S]*?<\/section>/)[0];
    expect(section.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('Refresh activity');
  }
});
