import { def } from "@expressive/mvc";

import { getRelated } from "./one";
import Type from "./Type";

export function get<T extends Type.Class>(Class: T, field?: keyof Type.Instance<T>) {
  return def((key, subject: Type) => {
    let Child: T | undefined;

    return {
      enumerable: false,
      set: false,
      get() {
        if (Child)
          return Child;

        const { fields } = Class;
        const { id } = subject;

        if (!id)
          throw new Error(`Parent entity ${id} does not exist`);

        if (!field)
          field = getRelated(Class, subject.constructor as Type.Class);

        if (!fields.has(field as string))
          throw new Error(`Field ${String(field)} does not exist on ${Class.name}`);

        Child = class extends (Class as typeof Type) {
          static subset = { [field as string]: id };
        } as unknown as T;

        Object.defineProperty(Child, 'name', { value: Class.name });

        return Child;
      }
    };
  }) as T;
}
