import { Field } from '..';

declare namespace Num {
  interface Int extends Num {
    readonly type: "int";
  }
  
  interface TinyInt extends Num {
    readonly type: "tinyint";
  }
  
  interface SmallInt extends Num {
    readonly type: "smallint";
  }
  
  interface BigInt extends Num {
    readonly type: "bigint";
  }
  
  interface Float extends Num {
    readonly type: "float";
  }
  
  interface Double extends Num {
    readonly type: "double";
  }

  type Type = Int | TinyInt | SmallInt | BigInt | Float | Double;

  type Options = Partial<Type>;
}

interface Num extends Field<number> {}

function Num<T extends Num.Options>(opts?: T){
  type Spec = Field.Specify<T, Num.Type, Num.Int>;

  return Field<Num.Type>(self => {
    const { set } = self;

    return {
      type: "int",
      ...opts,
      set(value: number){
        const output = set.call(self, value);
  
        if(typeof value !== "number" || isNaN(value))
          throw `Got '${value}' but value must be a number.`
    
        if(this.type === "int" && value !== Math.floor(value))
          throw `Got '${value}' but datatype is integer.`
    
        return output;
      }
    }
  }) as Spec;
}

export { Num };