// packages/sqlite/src/columns/Time.ts
import { Time } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Time {
    interface Timestamp extends TimeColumn {
      readonly type: "timestamp" | "datetime";
    }
    
    interface Date extends TimeColumn {
      readonly type: "date";
    }
    
    interface Time extends TimeColumn {
      readonly type: "time";
    }
    
    interface Integer extends TimeColumn {
      readonly type: "integer";
    }
    
    interface Text extends TimeColumn {
      readonly type: "text";
    }
    
    interface Types {
      default: Timestamp;
      timestamp: Timestamp;
      datetime: Timestamp;
      date: Date;
      time: Time;
      integer: Integer;
      text: Text;
    }
  }
}

class TimeColumn extends Time.Type {
  readonly type: keyof Time.Types = "text";
  
  get datatype() {
    // SQLite has only 5 storage classes: NULL, INTEGER, REAL, TEXT, and BLOB
    // We'll map the various time types to these storage classes
    const { type } = this;
    
    if (["date", "time", "timestamp", "datetime"].includes(type))
      return "text"; // Store as ISO string
    
    return type;
  }
  
  get(value: string | number | Date) {
    if (value instanceof Date)
      return value;
    
    if (typeof value === 'number')
      // Interpret as Unix timestamp (seconds since epoch)
      return new Date(value * 1000);
    
    if (typeof value === 'string') {
      if (this.type === "date") {
        // Use consistent date parsing by explicitly splitting the parts
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day); // month is 0-indexed in JS Date
      } else
        // For standard date strings, let the Date constructor handle it
        // ISO strings with 'Z' will be properly interpreted as UTC
        return new Date(value);
    }
    
    return new Date();
  }
  
  set(value: string | Date | "NOW") {
    if (value === "NOW")
      return "CURRENT_TIMESTAMP";
    
    if (value instanceof Date) {
      if (this.type === "integer")
        // Store as Unix timestamp (seconds since epoch)
        return Math.floor(value.getTime() / 1000);
      
      if (this.type === "date")
        return value.toISOString().slice(0, 10);
      
      if (this.type === "time")
        return value.toISOString().slice(11, 19);
      
      // Store full ISO string for timestamp/datetime
      // This preserves timezone information
      return value.toISOString();
    }
    
    return value;
  }
}

Time.Type = TimeColumn;