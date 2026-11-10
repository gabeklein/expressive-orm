import { Glob } from 'bun';
import { existsSync } from 'fs';
import { dirname, join, normalize } from 'path';

const problems: string[] = [];
const skills = new Map<string, string>();
const owner = new Map<string, string>();

const slug = (heading: string) =>
  heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');

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

  skills.set(name, dirname(path));
  owner.set(name, dir);
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

    const has = async (file: string, anchor?: string) =>
      anchor ? [...(await Bun.file(file).text()).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].some(([, heading]) => slug(heading) === anchor) : true;

    for (const match of text.matchAll(/\]\((\.{0,2}[^)\s:#]*\.md)(?:#([^)\s]+))?\)/g)) {
      const [, target, anchor] = match;
      const [skill, ...rest] = normalize(join(from, dirname(file), target)).split('/');
      const linked = join(dir, ...rest);

      if (skill !== from)
        problems.push(`${at(match.index)}  links ${target} outside its own skill - name it in plain text, as \`${[skill, ...rest].join('/')}\``);
      else if (!existsSync(linked))
        problems.push(`${at(match.index)}  links ${target}, which does not exist`);
      else if (!(await has(linked, anchor)))
        problems.push(`${at(match.index)}  links ${target}#${anchor}, but that file has no such heading`);
    }

    for (const match of text.matchAll(/`(expressive-[a-z]+)\/([^`\s#]+\.md)(?:#([^`\s]+))?`/g)) {
      const [, skill, rest, anchor] = match;
      const base = skills.get(skill) ?? installed(from, skill);

      if (!base) {
        problems.push(`${at(match.index)}  names ${skill}/${rest}, but no ${skill} skill is here or installed`);
        continue;
      }

      const named = join(base, rest);

      if (!existsSync(named))
        problems.push(`${at(match.index)}  names ${skill}/${rest}, which is not in the ${skill} skill`);
      else if (!(await has(named, anchor)))
        problems.push(`${at(match.index)}  names ${skill}/${rest}#${anchor}, but that file has no such heading`);
    }
  }

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`${skills.size} skills ok`);
