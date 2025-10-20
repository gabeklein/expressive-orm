import { Config, Field, Nullable } from './Field';
import { type Type } from './Type';

export type Instruction = <T extends Type>(key: string, parent: Type.Class<T>) => Field | void;

class StringColumn extends Field {
  type = String;
}

function str(nullable: Nullable): string | undefined;
function str(config?: Config): string;
function str(config?: Config | null) {
  return StringColumn.use(config);
}

class NumberColumn extends Field {
  type = Number;

  set(value: number){
    return value != null ? value.toString() : undefined;
  }

  get(value: string){
    return value != null ? parseFloat(value) : undefined;
  }
}

function num(nullable: Nullable): number | undefined;
function num(config?: Config): number;
function num(config?: Config | null) {
  return NumberColumn.use(config);
}

class BooleanColumn extends Field {
  type = Boolean;

  set(value: boolean){
    return value ? 1 : 0;
  }

  get(value: number){
    return value === undefined ? value : Boolean(value);
  }
}

function bool(nullable: Nullable): boolean | undefined;
function bool(config?: Config): boolean;
function bool(config?: Config) {
  return BooleanColumn.use(config);
}

class DateColumn extends Field {
  type = Date;

  set(value: Date){
    return value ? value.toISOString() : undefined;
  }

  get(value: string){
    return value ? new Date(value) : undefined;
  }
}

function date(nullable: Nullable): Date | undefined;
function date(config?: Config): Date;
function date(config?: Config) {
  return DateColumn.use(config);
}

class UUIDColumn extends Field {
  type = String;
}

function uuid(nullable: Nullable): string | undefined;
function uuid(config?: Config): string;
function uuid(config?: Config) {
  return UUIDColumn.use(config);
}

class JSONColumn extends Field {
  type = Object;

  set(value: any){
    return value ? JSON.stringify(value) : undefined;
  }

  get(value: string){
    return value ? JSON.parse(value) : undefined;
  }
}

function json<T>(nullable: Nullable): T | undefined;
function json<T>(config?: Config): T;
function json(config?: Config){
  return JSONColumn.use(config);
}

export {
  Field,
  json,
  str,
  num,
  bool,
  date,
  uuid
}