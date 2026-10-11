/* Build the FO14 owner-review index from measured screenshots; never alter the FO00 originals. */
const fs = require('node:fs');
const path = require('node:path');
const dir = 'docs/evidence/fo14';
const data = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const before = JSON.parse(fs.readFileSync('docs/evidence/fo00/before/measurements.json'));
const replacements = {
  '/research/rapm/six-factor': '/six-factor-rapm', '/similar-players': '/research/similarity',
  '/similar-players/shot-profile': '/shot-profile-twin', '/research/shooting': '/research/expected-shots',
  '/research/shooting/adjusted': '/research/adjusted-shooting', '/research/shooting/aftermath': '/shot-aftermath',
  '/whats-new': '/patch-notes', '/whats-new/blog': '/blog', '/methodology/learning': '/learning'
};
const groups = [...new Set(data.measurements.map(m => m.name))].map(name => data.measurements.filter(m => m.name === name));
const pathname = url => new URL(url, 'http://localhost').pathname;
const link = (label, file) => file ? `[${label}](${file})` : '—';
const rows = groups.map(group => {
  const d = group.find(m => m.view === 'desktop');
  const key = replacements[d.finalPath] || pathname(d.url);
  const old = Object.entries(before.routes).find(([url]) => pathname(url) === key)?.[1];
  const images = view => group.find(m => m.view === view)?.screenshot;
  return `| ${d.finalPath} (${d.name}) | ${link('Desktop', old?.desktop?.screenshot && '../fo00/before/' + old.desktop.screenshot)} · ${link('Phone', old?.phone?.screenshot && '../fo00/before/' + old.phone.screenshot)} | ${link('Desktop', images('desktop'))} · ${link('Tablet', images('tablet'))} · ${link('Phone', images('phone'))} · ${link('200%', images('zoom'))} |`;
});
fs.writeFileSync(path.join(dir, 'index.md'), `# FO14 before/after review index\n\n${groups.length} route states at desktop, tablet, phone and 200% desktop reflow. Before images are the retained FO00 originals; merged tabs link to their original route. New 404/manual-Ask states have no matching before image. After images capture the first screen; FO00 images retain their original full-page geometry.\n\n| Route / state | FO00 before | FO14 after |\n| --- | --- | --- |\n${rows.join('\n')}\n`);

const summary = {
  routeStates: groups.length, captures: data.measurements.length,
  overflows: data.measurements.filter(m => m.documentWidth > m.viewportWidth).map(m => [m.name, m.view]),
  errors: data.measurements.flatMap(m => m.errors.map(error => ({ name: m.name, view: m.view, error }))),
  axeViolations: data.measurements.flatMap(m => m.audit?.violations.map(v => ({ name: m.name, view: m.view, ...v })) || []),
  incompleteChecks: data.measurements.flatMap(m => m.audit?.incomplete.filter(i => i.nodes).map(i => ({ name: m.name, view: m.view, ...i })) || []),
  shortPhoneTargets: data.measurements.filter(m => m.view === 'phone' || m.view === 'zoom').flatMap(m => m.smallTargets.map(target => ({ name: m.name, view: m.view, ...target }))),
  clippedLabels: data.measurements.flatMap(m => m.clippedLabels.map(label => ({ name: m.name, view: m.view, label }))),
  misalignedNumbers: data.measurements.flatMap(m => m.badNumbers.map(cell => ({ name: m.name, view: m.view, ...cell }))),
  skipFailures: data.measurements.filter(m => !m.skipFocusedMain).map(m => [m.name, m.view]),
  invisibleFocus: data.measurements.flatMap(m => m.keyboard.filter(k => !k.visible || !k.focusIndicator).map(k => ({ name: m.name, view: m.view, ...k }))),
  exposedTechnicalText: data.measurements.filter(m => m.rawDates || m.uuids || m.hashes || m.cutoffRules).map(m => ({ name: m.name, view: m.view, dates: m.rawDates, uuids: m.uuids, hashes: m.hashes, rules: m.cutoffRules })),
  lateMainResults: data.measurements.filter(m => m.view === 'desktop' && m.mainTop > 400).map(m => ({ name: m.name, top: m.mainTop })),
  shortBarGaps: data.measurements.filter(m => m.afterBarGap !== null && m.afterBarGap < 16).map(m => ({ name: m.name, view: m.view, gap: m.afterBarGap }))
};
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])));

// These judgments combine the recorded measurements, screenshot review and current browser
// checks. They describe implementation evidence; they do not grant owner visual acceptance.
const glance = groups.map(group => {
  const desktop = group.find(m => m.view === 'desktop');
  const phone = group.find(m => m.view === 'phone');
  const design = desktop.name === 'design', manual = desktop.name === 'ask-manual', missing = desktop.name === 'not-found';
  const checks = {
    header: design ? 'partial' : desktop.h1Count === 1 && phone.h1Count === 1 ? 'pass' : 'fail',
    filters: design || manual ? 'partial' : desktop.afterBarGap === null ? 'n/a' : group.some(m => m.loadButtons.length || m.clippedLabels.length) ? 'fail' : 'pass',
    firstScreen: missing ? 'n/a' : manual ? 'partial' : desktop.mainTop === null || desktop.mainTop > 400 ? 'fail' : 'pass',
    alignment: group.some(m => m.badNumbers.length || (m.afterBarGap !== null && m.afterBarGap < 16)) ? 'fail' : 'pass',
    identity: ['article'].includes(desktop.template) || design || missing || manual || desktop.finalPath === '/research/ask' ? 'n/a' : group.some(m => m.brokenImages.length) ? 'fail' : 'pass',
    missingData: manual ? 'partial' : group.some(m => m.rawDates || m.uuids || m.hashes || m.cutoffRules) ? 'fail' : 'pass',
    icons: 'pass',
    states: manual ? 'partial' : 'pass',
    phone: phone.documentWidth > phone.viewportWidth || phone.smallTargets.length ? 'fail' : 'pass',
    dates: group.some(m => m.rawDates) ? 'fail' : 'pass'
  };
  const notes = design ? 'Living style guide deliberately demonstrates multiple headers and filter bars.'
    : manual ? 'Retained manual assistant form/provider disclosure; FO13/FO14 shared pickup preserves the assistant layout.'
    : missing ? 'Recovery action is in the header; there is no analytical result or subject.' : '';
  return { name: desktop.name, route: desktop.finalPath, mainTop: desktop.mainTop, checks, notes };
});
fs.writeFileSync(path.join(dir, 'glance.json'), JSON.stringify(glance, null, 2) + '\n');
const glanceRows = glance.map(row => `| ${row.name} | ${Object.values(row.checks).join(' | ')} | ${row.notes} |`);
fs.writeFileSync(path.join(dir, 'glance.md'), `# FO14 per-route glance review\n\nItems are in the handoff's order. Pass combines desktop/phone screenshot review, recorded geometry, source lint and the current browser suite. N/a means the route has no scoped filter, analytical result or primary subject. Partial items are disclosed below; no route is promoted to owner-verified. Loading evidence covers all six shared templates and the current suite's empty/error interactions, without claiming every possible failure was injected on every route.\n\n| State | 1 Header | 2 Filters | 3 First screen | 4 Alignment | 5 Identity | 6 Missing data | 7 Icons | 8 States | 9 Phone | 10 Dates | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${glanceRows.join('\n')}\n`);
