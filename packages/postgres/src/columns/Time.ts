// packages/postgres/src/columns/Time.ts
import { Time } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Time {
    interface Timestamp extends TimeColumn {
      readonly type: "timestamp";
      readonly precision?: number;
      readonly timezone?: boolean;
    }
    
    interface Date extends TimeColumn {
      readonly type: "date";
    }
    
    interface Time extends TimeColumn {
      readonly type: "time";
      readonly precision?: number;
      readonly timezone?: boolean;
    }
    
    interface Interval extends TimeColumn {
      readonly type: "interval";
      readonly fields?: string;
      readonly precision?: number;
    }
    
    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      date: Date;
      time: Time;
      interval: Interval;
    }
  }
}

class TimeColumn extends Time.Type {
  readonly timezone?: boolean;
  readonly fields?: string;
  
  get datatype() {
    const { type, precision, timezone, fields } = this;
    
    let datatype = type || "timestamp";
    
    if (timezone && type.startsWith("time"))
      datatype += "tz";
    
    if (precision !== undefined && ["timestamp", "time", "interval"].includes(type))
      datatype += ` (${precision})`;
    
    if (fields && type === "interval")
      datatype += ` ${fields}`;
    
    return datatype;
  }
  
  get(value: string | Date) {
    if (value instanceof Date)
      return value;
      
    if (this.type === "date") {
      // For date type, strip the time part
      const date = new Date(value.replace(/[-]/g, '/'));
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    
    return super.get(value);
  }
  
  set(value: string | Date) {
    if (value === "NOW") {
      return "CURRENT_TIMESTAMP";
    } else if (value instanceof Date) {
      if (this.type === "date") {
        return value.toISOString().slice(0, 10);
      } else if (this.type === "time") {
        return value.toISOString().slice(11, 19);
      } else {
        return value.toISOString().slice(0, 19).replace("T", " ");
      }
    } else if (typeof value === "string") {
      return value;
    } else {
      throw "Value must be a Date, string, or 'NOW'.";
    }
  }
}

Time.Type = TimeColumn;