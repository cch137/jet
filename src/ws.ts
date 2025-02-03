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
  to: (id: ChannelId) => JetWSChannel | undefined;
  subscribe: (id: ChannelId) => JetWSChannel;
  unsubscribe: (id: ChannelId) => JetWSChannel;
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
WebSocket.prototype.to = function (id: ChannelId) {
  return new JetWSChannel(id);
};

// @ts-ignore
WebSocket.prototype.subscribe = function (id: ChannelId) {};

// @ts-ignore
WebSocket.prototype.unsubscribe = function (id: ChannelId) {};

function broadcast(data: BufferLike, cb?: (err?: Error) => void): void;
function broadcast(
  data: BufferLike,
  options: {
    mask?: boolean | undefined;
    binary?: boolean | undefined;
    compress?: boolean | undefined;
    fin?: boolean | undefined;
  },
  cb?: (err?: Error) => void
): void;
function broadcast(
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

  join(soc: JetSocket) {
    this.sockets.add(soc);
    return this;
  }

  leave(soc: JetSocket) {
    this.sockets.delete(soc);
    return this;
  }

  broadcast = broadcast.bind(this);
}

export class JetWSChannel {
  private static channels = new Map<ChannelId, Set<JetSocket>>();

  constructor(id: ChannelId) {
    this.id = id;
  }

  readonly id: ChannelId;

  get sockets() {
    return Object.freeze(Array.from(JetWSChannel.channels.get(this.id) || []));
  }

  add(soc: JetSocket) {
    const channel = JetWSChannel.channels.get(this.id);
    if (channel) channel.add(soc);
    else JetWSChannel.channels.set(this.id, new Set([soc]));
    return this;
  }

  remove(soc: JetSocket) {
    const channel = JetWSChannel.channels.get(this.id);
    if (channel) {
      channel.delete(soc);
      if (channel.size === 0) JetWSChannel.channels.delete(this.id);
    }
    return this;
  }

  has(soc: JetSocket) {
    return JetWSChannel.channels.get(this.id)?.has(soc) || false;
  }

  broadcast = broadcast.bind(this);
}

export default WS;
