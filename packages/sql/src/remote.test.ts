import { afterEach, describe, expect, it, vi } from 'vitest';

import { Connection, Type } from '@expressive/orm';

import { SQLiteConnection } from './sqlite/SQLiteConnection';
import { schema } from './tests/schema';

const wire = {
  encode: (value: unknown) => JSON.stringify(value, function(key, item){
    const raw = (this as Record<string, unknown>)[key];
    return raw instanceof Date ? { $date: raw.toISOString() } : item;
  }),
  decode: (text: string) => JSON.parse(text, (_key, item) => (
    item && typeof item == "object" && "$date" in item ? new Date(item.$date) : item
  ))
};

type Floor = "select" | "insert" | "update" | "remove";

const TZ = process.env.TZ;

afterEach(() => {
  if (TZ === undefined)
    delete process.env.TZ;
  else
    process.env.TZ = TZ;
});

async function setup(zone?: string){
  const server = schema();
  const client = schema();
  const host = await SQLiteConnection.new(server.types);
  const sent = vi.fn();
  const received = vi.fn();

  async function call(method: Floor, args: unknown[]){
    const request = wire.encode(args);
    const local = process.env.TZ;

    sent(method, wire.decode(request));

    if (zone)
      process.env.TZ = zone;

    try {
      const response = await (host[method] as Function)(...wire.decode(request));
      const reply = wire.encode({ response });

      received(method, wire.decode(reply).response);

      return wire.decode(reply).response;
    }
    catch (error) {
      throw new Error((error as Error).message);
    }
    finally {
      if (zone)
        process.env.TZ = local;
    }
  }

  class Remote extends Connection {
    select(...args: Parameters<Connection["select"]>){
      return call("select", args);
    }

    insert(...args: Parameters<Connection["insert"]>){
      return call("insert", args);
    }

    update(...args: Parameters<Connection["update"]>){
      return call("update", args);
    }

    remove(...args: Parameters<Connection["remove"]>){
      return call("remove", args);
    }
  }

  const remote = await Remote.new(client.types);

  return { server, client, host, remote, sent, received, async close(){ await host.close(); await remote.close(); } };
}

describe("remote", () => {
  it("will round trip plain values through the server", async () => {
    const { client, server, sent, close } = await setup();
    const filed = new Date("2026-01-05T12:00:00.123Z");

    const attorney = await client.Attorney.insert({ name: "Lee", email: "lee@example.com" });
    const claim = await client.Claim.insert({
      attorney: attorney.id,
      filed,
      amount: 12.5,
      count: 3,
      closed: true,
      payment: ["check"]
    });

    const expected = { id: 1, attorney: 1, filed, amount: 12.5, count: 3, closed: true, payment: ["check"] };

    expect(claim).toEqual(expected);
    expect((await client.Claim.one({ id: claim.id })).columns).toEqual(expected);
    expect((await server.Claim.one({ id: claim.id })).columns).toEqual(expected);
    expect(sent).toHaveBeenCalledWith("insert", ["claim", {
      attorney_id: 1,
      filed,
      amount: 12.5,
      count: 3,
      closed: true,
      payment: ["check"]
    }, true, null]);

    await close();
  })

  it("will read rows the server wrote", async () => {
    const { client, server, close } = await setup();
    const filed = new Date("2026-02-01T00:00:00.000Z");

    await server.Attorney.insert({ name: "Kim", email: "kim@example.com" });
    await server.Claim.insert({ attorney: 1, filed, amount: 3.25, closed: false, payment: ["cash"] });

    const [claim] = await client.Claim.query({ filed });

    expect(claim).toEqual({ id: 1, attorney: 1, filed, amount: 3.25, count: undefined, closed: false, payment: ["cash"] });

    await close();
  })

  it("will keep entities live on the client", async () => {
    const { client, server, close } = await setup();

    await server.Attorney.insert({ name: "Kim", email: "kim@example.com" });
    await server.Claim.insert({ attorney: 1, closed: false });
    await server.Claim.insert({ attorney: 1, closed: false });

    const kim = await client.Attorney.get(1);
    const claims = await kim.claims.load();

    await claims[0].set({ closed: true, filed: new Date(0) });
    await claims[1].delete();

    expect(claims[0].attorney).toBe(kim);
    expect(await server.Claim.query()).toEqual([
      { id: 2, attorney: 1, filed: new Date(0), amount: undefined, count: undefined, closed: true, payment: undefined }
    ]);

    await close();
  })

  it.each([
    ["America/New_York", "UTC", [2026, 0, 5], "2026-01-05"],
    ["Asia/Tokyo", "UTC", [2026, 0, 2], "2026-01-02"],
    ["UTC", "Asia/Tokyo", [2026, 0, 2, 23, 30], "2026-01-02"],
    ["Pacific/Kiritimati", "Pacific/Pago_Pago", [2026, 0, 2], "2026-01-02"]
  ] as const)("will carry a calendar day from %s to a server in %s", async (zone, serverZone, parts, text) => {
    process.env.TZ = zone;

    const { client, host, sent, received, close } = await setup(serverZone);
    const [year, month, date, ...time] = parts;
    const given = new Date(year, month, date, ...time);
    const day = new Date(year, month, date);
    const claim = await client.Claim.insert({ due: given });

    expect(sent).toHaveBeenCalledWith("insert", ["claim", { due: text }, true, null]);
    expect(received).toHaveBeenLastCalledWith("insert", { id: 1, attorney_id: null, filed: null, due: text, amount: null, count: null, closed: null, payment: null });
    expect(claim.due).toEqual(day);

    const [found] = await client.Claim.query({ due: day });

    expect(sent).toHaveBeenLastCalledWith("select", ["claim", [["due", "=", text]], null, 0]);
    expect(found.due).toEqual(day);

    const entity = await client.Claim.get(1);

    await entity.set({ due: "2026-03-01" });

    expect(sent).toHaveBeenLastCalledWith("update", ["claim", 1, { due: "2026-03-01" }]);
    expect(entity.due).toEqual(new Date(2026, 2, 1));

    process.env.TZ = serverZone;

    const db = await (host as SQLiteConnection)["db"]();

    expect(await db.all("SELECT due FROM claim")).toEqual([{ due: "2026-03-01" }]);

    await close();
  })

  it("will reject a portable violation on the client", async () => {
    const { client, sent, close } = await setup();

    await expect(client.Claim.insert({ count: 12.5 })).rejects.toThrow("Value 12.5 out of range for integer.");
    await expect(client.Claim.insert({ amount: 1.234 })).rejects.toThrow("Value 1.234 exceeds scale of 2.");
    expect(sent).not.toHaveBeenCalled();

    await close();
  })

  it("will reject a portable violation on the server", async () => {
    const { remote, server, close } = await setup();

    await expect(remote.insert("claim", { count: 12.5 })).rejects.toThrow("Value 12.5 out of range for integer.");
    await expect(remote.insert("claim", { closed: "yes" })).rejects.toThrow("Value must be a boolean.");
    await expect(remote.select("claim", [["count", "=", 1.5]])).rejects.toThrow("Value 1.5 out of range for integer.");
    expect(await server.Claim.count()).toBe(0);

    await close();
  })

  it("will reject a storage violation on the server", async () => {
    const { client, server, close } = await setup();

    await client.Attorney.insert({ name: "Lee", email: "lee@example.com" });

    await expect(client.Attorney.insert({ name: "Leigh", email: "lee@example.com" })).rejects.toThrow(/UNIQUE/);
    expect(await server.Attorney.count()).toBe(1);

    await close();
  })

  it("will bind the same schema without codecs", async () => {
    const { remote, client, close } = await setup();

    expect(client.Claim.connection).toBe(remote);
    expect(remote._datatype(client.Claim.fields.get("amount")!)).toBe("decimal");
    expect(Type.connection).not.toBe(remote);

    await close();
  })
})
