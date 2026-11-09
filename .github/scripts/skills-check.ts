import { Glob } from 'bun';
import { dirname, join, normalize } from 'path';

const problems: string[] = [];
const skills = new Map<string, string>();
const reach = new Map<string, Set<string>>();

const slug = (heading: string) =>
  heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');

for await (const path of new Glob('packages/*/skills/*/SKILL.md').scan('.')) {
  const name = path.split('/')[3];
  const pkg = await Bun.file(join(path.split('/').slice(0, 2).join('/'), 'package.json')).json();
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });

  try {
    const meta = Bun.YAML.parse((await Bun.file(path).text()).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '') as any;

    if (meta?.name !== name || typeof meta.description !== 'string')
      problems.push(`${path}  frontmatter needs name: ${name} and a description`);
  } catch (error) {
    problems.push(`${path}  frontmatter is not valid YAML, so skill installers skip it - ${(error as Error).message}`);
  }

  if (!pkg.files?.includes('skills'))
    problems.push(`${pkg.name} does not list "skills" in its package.json files, so the skill is not packed`);

  const listed: string[] = (pkg.skills ?? []).map((entry: string) => entry.replace(/^npm:/, ''));

  for (const dep of Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@expressive/')))
    if (!listed.includes(dep))
      problems.push(`${pkg.name} depends on ${dep} - list "npm:${dep}" in its package.json skills, or skills sync will not install that skill`);

  skills.set(name, dirname(path));
  reach.set(name, new Set([name, ...deps.filter((d) => d.startsWith('@expressive/')).map((d) => d.replace('@expressive/', 'expressive-'))]));
}

for await (const path of new Glob('packages/*/skills/**/*.md').scan('.')) {
  const text = await Bun.file(path).text();
  const from = path.split('/')[3];
  const at = (index: number) => `${path}:${text.slice(0, index).split('\n').length}`;

  for (const match of text.matchAll(/\]\((\.{0,2}[^)\s:#]*\.md)(?:#([^)\s]+))?\)/g)) {
    const [, target, anchor] = match;
    const into = normalize(join(dirname(path.split('/').slice(3).join('/')), target));
    const [skill, ...rest] = into.split('/');

    if (!reach.get(from)!.has(skill)) {
      problems.push(`${at(match.index)}  links ${target}, but ${from} does not depend on that package - name the skill in plain text`);
      continue;
    }

    if (!skills.has(skill))
      continue;

    const file = Bun.file(join(skills.get(skill)!, ...rest));

    if (!(await file.exists()))
      problems.push(`${at(match.index)}  links ${target}, which is not in any installed skill`);
    else if (anchor && ![...(await file.text()).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].some(([, heading]) => slug(heading) === anchor))
      problems.push(`${at(match.index)}  links ${target}#${anchor}, but that file has no such heading`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`${skills.size} skills ok`);
