import { Glob } from 'bun';
import { existsSync } from 'fs';
import { dirname, join, normalize } from 'path';

const problems: string[] = [];
const skills = new Map<string, string>();
const owner = new Map<string, string>();
const reach = new Map<string, Set<string>>();

const slug = (heading: string) =>
  heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');

const scoped = (deps?: Record<string, string>) =>
  Object.keys(deps ?? {}).filter((dep) => dep.startsWith('@expressive/'));

for await (const manifest of new Glob('packages/*/package.json').scan('.')) {
  const pkg = await Bun.file(manifest).json();

  if (pkg.private)
    continue;

  const dir = dirname(manifest);
  const name = `expressive-${pkg.name.replace(/^@expressive\//, '')}`;
  const path = join(dir, 'skills', name, 'SKILL.md');

  if (!(await Bun.file(path).exists())) {
    problems.push(`${pkg.name} ships no skill - add ${path}`);
    continue;
  }

  try {
    const meta = Bun.YAML.parse((await Bun.file(path).text()).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '') as any;

    if (meta?.name !== name || typeof meta.description !== 'string')
      problems.push(`${path}  frontmatter needs name: ${name} and a description`);
  } catch (error) {
    problems.push(`${path}  frontmatter is not valid YAML, so skill installers skip it - ${(error as Error).message}`);
  }

  if (!pkg.files?.includes('skills'))
    problems.push(`${pkg.name} does not list "skills" in its package.json files, so the skill is not packed`);

  const direct = scoped(pkg.dependencies);
  const expected = direct.map((dep) => `npm:${dep}`);
  const listed: unknown[] = pkg.skills ?? [];

  for (const entry of expected)
    if (!listed.includes(entry))
      problems.push(`${pkg.name} depends on ${entry.slice(4)} - list "${entry}" in its package.json skills, or skills experimental_sync will not install that skill`);

  for (const entry of listed)
    if (!expected.includes(entry as string))
      problems.push(`${pkg.name} lists ${JSON.stringify(entry)} in skills - list exactly "npm:<dep>" for each direct @expressive/* dependency, and no peers`);

  skills.set(name, dirname(path));
  owner.set(name, dir);
  reach.set(name, new Set([name, ...[...direct, ...scoped(pkg.peerDependencies)].map((dep) => dep.replace('@expressive/', 'expressive-'))]));
}

if (!skills.size)
  problems.push('no package skills found under packages/*/skills');

const installed = (from: string, skill: string) => {
  const pkg = skill.replace(/^expressive-/, '@expressive/');

  for (const modules of [join(owner.get(from)!, 'node_modules'), 'node_modules']) {
    const dir = join(modules, pkg, 'skills', skill);

    if (existsSync(dir))
      return dir;
  }
};

for (const [from, dir] of skills)
  for await (const file of new Glob('**/*.md').scan(dir)) {
    const path = join(dir, file);
    const text = await Bun.file(path).text();
    const at = (index: number) => `${path}:${text.slice(0, index).split('\n').length}`;

    for (const match of text.matchAll(/\]\((\.{0,2}[^)\s:#]*\.md)(?:#([^)\s]+))?\)/g)) {
      const [, target, anchor] = match;
      const [skill, ...rest] = normalize(join(from, dirname(file), target)).split('/');

      if (!reach.get(from)!.has(skill)) {
        problems.push(`${at(match.index)}  links ${target}, but ${from} does not depend on that package - name the skill in plain text`);
        continue;
      }

      const base = skills.get(skill) ?? installed(from, skill);

      if (!base)
        continue;

      const linked = Bun.file(join(base, ...rest));

      if (!(await linked.exists()))
        problems.push(`${at(match.index)}  links ${target}, which is not in the ${skill} skill`);
      else if (anchor && ![...(await linked.text()).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].some(([, heading]) => slug(heading) === anchor))
        problems.push(`${at(match.index)}  links ${target}#${anchor}, but that file has no such heading`);
    }
  }

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`${skills.size} skills ok`);
