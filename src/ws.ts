import { Duplex } from "node:stream";
import type Events from "node:events";
import Emitter from "@cch137/emitter";
import WS, { WebSocket, WebSocketServer } from "ws";

import { BiSet } from "./utils.js";

export { Duplex, WebSocketServer as JetWebSocketServer };

type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | readonly any[]
  | readonly number[]
  | { valueOf(): ArrayBuffer }
  | { valueOf(): SharedArrayBuffer }
  | { valueOf(): Uint8Array }
  | { valueOf(): readonly number[] }
  | { valueOf(): string }
  | { [Symbol.toPrimitive](hint: string): string };

type ChannelId = string | number | symbol;

export type JetSocket = WebSocket & {
  readonly rooms: BiSet<JetSocket, "sockets", JetWSRoom>;
  readonly roles: Readonly<Set<string | number | symbol>>;
  join: {
    (room: JetWSRoom): JetWSRoom;
    (channelId: ChannelId): JetWSChannel;
  };
  leave: {
    (room: JetWSRoom): JetWSRoom;
    (channelId: ChannelId): JetWSChannel | undefined;
  };
} & Events<{ join: [JetWSRoom]; leave: [JetWSRoom] }>;

const _ROLES = Symbol("roles");

Object.defineProperty(WebSocket.prototype, "rooms", {
  get: function () {
    const value = new BiSet<JetSocket, "sockets", JetWSRoom>(this, "sockets");
    Object.defineProperty(this, "rooms", {
      value,
      configurable: false,
      writable: false,
    });
    return value;
  },
  configurable: true,
});

Object.defineProperty(WebSocket.prototype, "roles", {
  get: function () {
    return this[_ROLES] || (this[_ROLES] = new Set());
  },
});

// @ts-ignore
WebSocket.prototype.join = function (room: JetWSRoom | ChannelId) {
  if (room instanceof JetWSRoom) {
    room.add(this as JetSocket);
    return room;
  }
  const channel = JetWSChannel.get(room);
  channel.add(this as JetSocket);
  return channel;
};

// @ts-ignore
WebSocket.prototype.leave = function (room: JetWSRoom | ChannelId) {
  if (room instanceof JetWSRoom) {
    room.remove(this as JetSocket);
    return room;
  }
  const channel = JetWSChannel.tryGet(room);
  channel?.remove(this as JetSocket);
  return channel;
};

export class JetWSRoom extends Emitter<{
  join: [JetSocket];
  leave: [JetSocket];
}> {
  constructor(
    onjoin?: (soc: JetSocket) => void,
    onleave?: (soc: JetSocket) => void
  ) {
    super();
    this.sockets = new BiSet<JetWSRoom, "rooms", JetSocket>(
      this,
      "rooms",
      void 0,
      onjoin
        ? (s) => (onjoin(s), this.emit("join", s), s.emit("join", this))
        : (s) => (this.emit("join", s), s.emit("join", this)),
      onleave
        ? (s) => (onleave(s), this.emit("leave", s), s.emit("leave", this))
        : (s) => (this.emit("leave", s), s.emit("leave", this))
    );
  }

  readonly sockets: BiSet<JetWSRoom, "rooms", JetSocket>;

  add(soc: JetSocket) {
    return this.sockets.add(soc);
  }

  remove(soc: JetSocket) {
    return this.sockets.delete(soc);
  }

  has(soc: JetSocket) {
    return this.sockets.has(soc);
  }

  broadcast(data: BufferLike, cb?: (err?: Error) => void): void;
  broadcast(
    data: BufferLike,
    options: {
      mask?: boolean | undefined;
      binary?: boolean | undefined;
      compress?: boolean | undefined;
      fin?: boolean | undefined;
    },
    cb?: (err?: Error) => void
  ): void;
  broadcast(
    data: BufferLike,
    arg2?: object | ((err?: Error) => void),
    arg3?: (err?: Error) => void
  ) {
    const cb = typeof arg2 === "function" ? arg2 : arg3;
    const options = typeof arg2 === "object" ? arg2 : {};
    // @ts-ignore
    this.sockets.forEach((soc) =>
      soc.send(data, options, cb as (err?: Error) => void)
    );
  }
}

export class JetWSChannel extends JetWSRoom {
  private static readonly channels = new Map<ChannelId, JetWSChannel>();

  static get(id: ChannelId, permanent?: boolean) {
    if (!this.channels.has(id)) {
      this.channels.set(id, new JetWSChannel(id, permanent));
    }

    return this.channels.get(id)!;
  }

  static tryGet(id: ChannelId) {
    return this.channels.get(id);
  }

  static clean() {
    for (const [id, channel] of this.channels) {
      if (!channel.sockets.size && !channel.permanent) this.channels.delete(id);
    }
  }

  private constructor(
    public readonly id: ChannelId,
    public readonly permanent = false
  ) {
    super();
  }
}

export default WS;
