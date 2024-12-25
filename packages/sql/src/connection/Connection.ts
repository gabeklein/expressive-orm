import { Type } from '..';
import { values } from '../utils';

declare namespace Connection {
  type Types =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  type Using = { [key: string | number]: typeof Type };
}

let defaultConnection: Connection;

abstract class Connection {
  readonly using: Readonly<Set<typeof Type>>;
  readonly ready = false;

  constructor(using: Connection.Types){
    this.using = Object.freeze(new Set(values(using).map(x => {
      if(x.hasOwnProperty('connection'))
        throw new Error(`Type ${x.name} already has assigned connection.`);

      x.connection = this;
      return x;
    })));
    
    if(!defaultConnection)
      defaultConnection = this;
  }

  abstract close(): Promise<void>;
  abstract send(qs: string): Promise<any>;
  abstract sync(fix?: boolean): Promise<void>;
  abstract valid(type: Type.EntityType): Promise<boolean>;

  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }
}

export { Connection };