/** Exercise the real flat config, including rules added by the supported major.
 * In-memory fixtures only: no deliberately invalid source files enter the repo.
 */
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const eslint = new ESLint();
let checks = 0;
const pass = label => { checks++; console.log(`✓ ${label}`); };
const messages = async (source, filePath = 'src/lint-fixture.tsx') => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages;
};
const rejects = async (label, rule, source, filePath) => {
  const result = await messages(source, filePath);
  assert(result.some(message => message.ruleId === rule && message.severity === 2),
    `${label}: expected an error from ${rule}; got ${JSON.stringify(result)}`);
  pass(label);
};
const accepts = async (label, source, filePath) => {
  assert.deepEqual(await messages(source, filePath), [], label);
  pass(label);
};

const config = await eslint.calculateConfigForFile('src/ui/App.tsx');
for (const [rule, setting] of Object.entries(reactHooks.configs.recommended.rules)) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  const expected = { off: 0, warn: 1, error: 2 }[severity] ?? severity;
  assert.equal(config.rules[rule][0], expected, `${rule} must retain its recommended severity`);
}
assert.equal(config.rules['react-hooks/exhaustive-deps'][0], 1);
assert.equal(config.rules['react-refresh/only-export-components'][0], 1);
pass('full React Hooks recommended rules and Fast Refresh remain active');

await rejects('conditional hooks are rejected', 'react-hooks/rules-of-hooks', `
  import { useState } from 'react';
  export function Broken({ active }: { active: boolean }) {
    if (active) useState(0);
    return null;
  }
`);
await rejects('render-time ref writes are rejected', 'react-hooks/refs', `
  import { useRef } from 'react';
  export function Broken({ active }: { active: boolean }) {
    const latest = useRef(active);
    latest.current = active;
    return null;
  }
`);
await rejects('synchronous effect state resets are rejected', 'react-hooks/set-state-in-effect', `
  import { useEffect, useState } from 'react';
  export function Broken({ value }: { value: number }) {
    const [copy, setCopy] = useState(value);
    useEffect(() => { setCopy(value); }, [value]);
    return <span>{copy}</span>;
  }
`);
await rejects('mutation of hook-returned state is rejected', 'react-hooks/immutability', `
  import { useState } from 'react';
  export function Broken() {
    const [value] = useState({ count: 0 });
    value.count = 1;
    return <span>{value.count}</span>;
  }
`);
const missingDependency = await messages(`
  import { useEffect } from 'react';
  export function Broken({ value }: { value: number }) {
    useEffect(() => { document.title = String(value); }, []);
    return null;
  }
`);
assert(missingDependency.some(message => message.ruleId === 'react-hooks/exhaustive-deps' && message.severity === 1));
pass('missing effect dependencies still warn');

await accepts('external-system callbacks can update state', `
  import { useEffect, useState } from 'react';
  export function Valid() {
    const [count, setCount] = useState(0);
    useEffect(() => {
      const update = () => setCount(value => value + 1);
      window.addEventListener('focus', update);
      return () => window.removeEventListener('focus', update);
    }, []);
    return <span>{count}</span>;
  }
`);
await accepts('guarded prop adjustment before commit is valid', `
  import { useState } from 'react';
  export function Valid({ command }: { command: number }) {
    const [previous, setPrevious] = useState(command);
    const [value, setValue] = useState(command);
    if (previous !== command) { setPrevious(command); setValue(command); }
    return <span>{value}</span>;
  }
`);
await accepts('derived values do not require effect state', `
  import { useMemo } from 'react';
  export function Valid({ values }: { values: number[] }) {
    const sum = useMemo(() => values.reduce((a, b) => a + b, 0), [values]);
    return <span>{sum}</span>;
  }
`);
await rejects('ESLint 10 recommended unassigned-variable rule is active', 'no-unassigned-vars',
  'let value; console.log(value);', 'scripts/lint-fixture.mjs');
await accepts('Node scripts retain Node globals', 'console.log(process.versions.node);', 'scripts/lint-fixture.mjs');
await rejects('Node scripts do not inherit browser globals', 'no-undef',
  'document.title = "invalid";', 'scripts/lint-fixture.mjs');
assert(await eslint.isPathIgnored('dist/lint-fixture.js'));
assert(await eslint.isPathIgnored('node_modules/lint-fixture.js'));
pass('generated output and installed dependencies remain ignored');
console.log(`\n${checks} lint-toolchain contract checks passed.`);
