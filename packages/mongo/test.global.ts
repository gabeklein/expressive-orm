import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    mongo: string;
  }
}

export default async function setup(project: TestProject) {
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  project.provide('mongo', server.getUri());

  return () => server.stop();
}
