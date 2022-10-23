import Column from './Column';

declare namespace Date {
  interface Options extends Column.Options {
    default?: "NOW" | Date;
  }

  type Nullable = Options & { nullable: true };
}

function Date<T>(options: Date.Nullable): Date | null | undefined;
function Date(options?: Date.Options): Date;
function Date(options?: Date.Options){
  return Column({
    ...options,
    datatype: 'DATETIME',
    get(dt: string){
      return new global.Date(dt.replace(/[-]/g, '/') + "Z");
    },
    set(date: Date){
      return date.toISOString().slice(0, 19).replace("T", " ");
    }
  });
}

export { Date };