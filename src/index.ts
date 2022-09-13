import Connection from './connection/Connection';
import Entity from './Entity';
import Bool from './instruction/Bool';
import Int, { BigInt, SmallInt, TinyInt } from './instruction/Int';
import Many from './instruction/Many';
import One from './instruction/One';
import Ref from './instruction/Ref';
import Table from './instruction/Table';
import Text, { LongText, MediumText, TinyText } from './instruction/Text';
import VarChar from './instruction/VarChar';
import Query from './Query';

export default Entity;
export {
  BigInt,
  Bool,
  Connection,
  Entity,
  Int,
  LongText,
  Many,
  MediumText,
  One,
  Query,
  Ref,
  SmallInt,
  Table,
  Text,
  TinyInt,
  TinyText,
  VarChar,
}