import { use } from "./fields";
import { getRelated } from "./one";
import Type from "./Type";

export function get<T extends Type.Class>(Class: T, field?: keyof Type.Instance<T>) {
  return use<T>((key, type) => {
    function get(this: Type.Instance<T>) {
      const { fields } = Class;
      const { id } = this;

      if (!id)
        throw new Error(`Parent entity ${id} does not exist`);

      if(!field)
      field = getRelated(Class, type);

      if(field && fields.has(field as string)) {
        class Child extends (Class as typeof Type) {
          static subset = { [field as string]: id };
        };

        Object.defineProperty(Child, 'name', { value: Class.name });
        Object.defineProperty(this, key, { value: Child });

        return Child;
      }

      throw new Error(`Field ${String(field)} does not exist on ${Class.name}`);
    };

    get.toString = () => `get${Class.name}`;
    Object.defineProperty(type.prototype, key, { get, configurable: true });
  });
}