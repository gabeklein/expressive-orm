import Entity from '../Entity';
import Definition from '../Definition';

abstract class Connection {
  managed = new Map<typeof Entity, Definition>();

  abstract query(queryString: string): Promise<any>;

  apply(from: typeof Entity[]): void;
  apply(from: { [key: string | number]: typeof Entity }): void;
  apply(from: {}){
    const entities = Object.values<typeof Entity>(from);

    for(const type of entities){
      const table = type.init(this);
      this.managed.set(type, table);
    }
  }

  close?(): void;
}

export default Connection;