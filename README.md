# Jet Module - Detailed Developer Documentation

Jet is a lightweight, modular web server framework for Node.js, designed to simplify the creation of HTTP and WebSocket servers. Built directly on Node.js's native `http` module, Jet extends its functionality with custom request and response handling, a powerful routing system, integrated WebSocket support with room and channel management, and a suite of middleware for common web development tasks. This framework is ideal for developers seeking fine-grained control over server behavior without the overhead of larger frameworks like Express. Jet is fully typed with TypeScript, ensuring a robust development experience.

This document provides an exhaustive guide to Jet's architecture, components, middleware, and usage, tailored for developers who need to understand and utilize every aspect of the module.

## Installation

Install Jet via NPM:

```bash
npm install jet
```

## Quick Start

Here's a minimal example to launch a Jet server:

```javascript
const Jet = require("jet");

const app = new Jet();

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## Core Architecture

### Overview

Jet is structured around a central `Jet` class that extends `http.Server` from Node.js. This class serves as the entry point for configuring and running the server, handling both HTTP requests and WebSocket upgrades. Key components include:

- **HTTP Handling**: Enhanced request (`JetRequest`) and response (`JetResponse`) objects with additional properties and methods for easier processing.
- **Routing**: Managed by `JetRouter`, which supports parameterized routes, middleware chaining, and various HTTP methods.
- **WebSocket Support**: Provided by `JetWebSocketServer`, with room (`JetWSRoom`) and channel (`JetWSChannel`) systems for organizing real-time communications.
- **Middleware**: A collection of utilities for tasks like CORS, body parsing, and cache control, which can be applied globally or per route.

### Request and Response Processing

Jet augments Node.js's native `http.IncomingMessage` and `http.ServerResponse` classes:

- **JetRequest**: Extends `http.IncomingMessage` with properties like `urlObject` (parsed URL), `ip` (client IP), `ua` (user agent parsing), `cookies`, `charset`, `protocol`, `params` (route parameters), `query` (parsed query string), `body` (parsed request body), and `files` (for multipart uploads). It also includes a `getHeader(name)` method for convenient header access.
- **JetResponse**: Extends `http.ServerResponse` with methods like `send(data)` (send raw data), `json(data)` (send JSON), `type(type)` (set Content-Type), `status(code, message)` (set status), `redirect(url, options)` (redirect client), `sendFile(path, options)` (send file), `setCookie(name, value, options)` (set cookie), and `removeCookie(name, options)` (remove cookie).

### Routing Mechanism

Routing in Jet is handled by the `JetRouter` class, which maintains a stack of route handlers for HTTP methods and WebSocket connections. Routes can be defined with path patterns including parameters (e.g., `/user/:id`), and handlers can be chained with middleware using a `next()` function to pass control to subsequent handlers.

### WebSocket System

Jet's WebSocket implementation extends the `ws` library, providing `JetWebSocketServer` for server management and `JetSocket` for client connections. Sockets can be grouped into rooms or channels for targeted broadcasting and event handling, with built-in support for heartbeat monitoring to detect inactive clients.

## Detailed Class and Method Documentation

### `Jet` Class

The `Jet` class is the core of the framework, extending `http.Server` to provide a unified interface for HTTP and WebSocket server management.

- **Prototype**: `class Jet extends http.Server`
- **Constructor**: `new Jet(options: JetServerOptions = {})`
  - **Parameters**:
    - `options`: An object extending `http.ServerOptions` with additional properties:
      - `qsParseOptions: qs.IParseOptions` - Options for query string parsing (default includes a custom decoder for boolean and numeric values).
      - `errorHandler: JetErrorHandler` - Custom error handler function (default sends a 500 status and ends response).
  - **Example**:
    ```javascript
    const Jet = require("jet");
    const app = new Jet({
      qsParseOptions: { depth: 10 },
      errorHandler: (req, res, error) => {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
      },
    });
    ```
- **Properties**:
  - `wss: JetWebSocketServer` - Instance of the WebSocket server (configured with `noServer: true` for integration with HTTP server upgrades).
  - `route: JetRouter` - Instance of the router for handling HTTP and WebSocket routes.
  - `qsParseOptions?: qs.IParseOptions` - Stored query string parsing options.
  - `errorHandler: JetErrorHandler` - Stored error handler function.
- **Routing Methods**: Jet exposes routing methods directly from `JetRouter`, allowing route definition at the server level:
  - `use(pathPattern?: string, handler: JetRouteHandler | JetRouteBase): JetRouteBase` - Add middleware or sub-router for all methods.
  - `get(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a GET route.
  - `post(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a POST route.
  - `put(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a PUT route.
  - `delete(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a DELETE route.
  - `head(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a HEAD route.
  - `trace(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a TRACE route.
  - `patch(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a PATCH route.
  - `connect(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define a CONNECT route.
  - `options(pathPattern: string, handler: JetRouteHandler): JetRouteBase` - Define an OPTIONS route.
  - `ws(pathPattern: string, handler: JetWSRouteHandler, predicate?: JetWSRoutePredicate): JetWSRouteBase` - Define a WebSocket route.
  - `static(pattern?: string, root: string, options?: ServeStaticOptions): JetRouteBase` - Serve static files from a directory.
  - **Example**:
    ```javascript
    app.get("/hello", (req, res) => {
      res.send("Hello!");
    });
    app.ws("/chat", (socket, req, head) => {
      socket.on("message", (data) => {
        console.log("Received:", data);
      });
    });
    app.static("/public", "./public", { index: ["index.html"] });
    ```
- **Usage**: The `Jet` class is instantiated to create a server instance, which can then be configured with routes and middleware before calling `listen()` to start the server.

### `JetRouter` Class

`JetRouter` manages the routing logic for both HTTP and WebSocket requests, maintaining a stack of handlers to process incoming requests.

- **Prototype**: `class JetRouter extends JetRouteBase`
- **Constructor**: `new JetRouter(handler?: JetRouteHandler)`
  - **Parameters**:
    - `handler`: Optional initial middleware or route handler to add to the stack.
  - **Example**:
    ```javascript
    const Jet = require("jet");
    const router = new Jet.Router((req, res, next) => {
      console.log("Middleware executed");
      next();
    });
    ```
- **Properties**:
  - `stack: (JetRouteBase | JetWSRouteBase)[]` - Array of route handlers (HTTP and WebSocket).
- **Methods**: Same as `Jet` class routing methods (`use`, `get`, `post`, etc.), which add handlers to the stack.
  - `addHandler(method?: HTTPMethod | WSMethod, pattern?: string, handler?: JetRouteHandler | JetRouteBase | JetWSRouteHandler | JetWSRouteBase, predicate?: JetWSRoutePredicate): JetRouteBase | JetWSRouteBase` - Internal method to add a handler to the stack.
  - `removeHandler(routeBase: JetRouteBase | JetWSRouteBase): boolean` - Remove a specific handler from the stack.
  - `handle(req: JetRequest, res: JetResponse, next: JetRouteNextHandler, root?: string, currentPattern?: string): Promise<void>` - Process an HTTP request through the stack of handlers.
  - `handleSocket(wss: JetWebSocketServer, soc: Duplex, req: JetRequest, head: Buffer, next: JetRouteNextHandler, root?: string, currentPattern?: string): Promise<void>` - Process a WebSocket upgrade request.
  - **Example**:
    ```javascript
    const router = new Jet.Router();
    router.get("/test", (req, res) => {
      res.send("Test route");
    });
    app.use(router);
    ```
- **Usage**: `JetRouter` can be used standalone to create sub-routers or directly via the `Jet` instance. It supports nested routing by adding routers as middleware.

### `JetWebSocketServer` Class

`JetWebSocketServer` extends the `ws.WebSocketServer` to provide custom WebSocket server functionality integrated with Jet's HTTP server.

- **Prototype**: `class JetWebSocketServer extends WebSocketServer`
- **Constructor**: `new JetWebSocketServer(options: WebSocketServerOptions)`
  - **Parameters**:
    - `options`: Configuration for the WebSocket server (Jet sets `noServer: true` to handle upgrades manually).
  - **Example**:
    ```javascript
    const wss = new Jet.WebSocketServer({ noServer: true });
    ```
- **Methods**:
  - `setHeartbeat(intervalMs: number, timeoutMs: number, pingData?: any, pingMask?: boolean, pingCb?: (err: Error) => void): void` - Set up a heartbeat mechanism to ping clients at intervals and terminate unresponsive ones after a timeout.
    - **Parameters**:
      - `intervalMs`: Interval between pings in milliseconds.
      - `timeoutMs`: Timeout after which unresponsive clients are terminated.
      - `pingData`: Optional data to send with ping.
      - `pingMask`: Optional boolean to mask ping data.
      - `pingCb`: Optional callback for ping errors.
    - **Example**:
      ```javascript
      app.wss.setHeartbeat(30000, 5000, "ping", false, (err) => {
        console.error("Ping error:", err);
      });
      ```
  - `clearHeartbeat(): void` - Stop the heartbeat mechanism.
    - **Example**:
      ```javascript
      app.wss.clearHeartbeat();
      ```
- **Usage**: Typically accessed via `Jet.wss`, this class manages WebSocket connections and upgrades, with additional features like heartbeat for connection health monitoring.

### `JetWSRoom` Class

`JetWSRoom` manages a group of WebSocket connections, allowing for broadcasting and event handling when sockets join or leave.

- **Prototype**: `class JetWSRoom extends Emitter<{ join: [JetSocket]; leave: [JetSocket]; }>`
- **Constructor**: `new JetWSRoom(onjoin?: (soc: JetSocket) => void, onleave?: (soc: JetSocket) => void)`
  - **Parameters**:
    - `onjoin`: Optional callback when a socket joins.
    - `onleave`: Optional callback when a socket leaves.
  - **Example**:
    ```javascript
    const room = new Jet.WSRoom(
      (soc) => console.log("Socket joined:", soc),
      (soc) => console.log("Socket left:", soc)
    );
    ```
- **Properties**:
  - `sockets: BiSet<JetWSRoom, "rooms", JetSocket>` - Bidirectional set linking the room to its sockets.
- **Methods**:
  - `add(soc: JetSocket): boolean` - Add a socket to the room.
    - **Example**:
      ```javascript
      room.add(socket);
      ```
  - `remove(soc: JetSocket): boolean` - Remove a socket from the room.
    - **Example**:
      ```javascript
      room.remove(socket);
      ```
  - `has(soc: JetSocket): boolean` - Check if a socket is in the room.
    - **Example**:
      ```javascript
      if (room.has(socket)) {
        console.log("Socket is in room");
      }
      ```
  - `broadcast(data: BufferLike, cb?: (err?: Error) => void): void` - Send data to all sockets in the room.
  - `broadcast(data: BufferLike, options: { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean; }, cb?: (err?: Error) => void): void` - Send data with specific WebSocket options.
    - **Parameters**:
      - `data`: Data to broadcast (string, Buffer, etc.).
      - `options`: WebSocket send options (mask, binary, compress, fin).
      - `cb`: Optional callback for send errors.
    - **Example**:
      ```javascript
      room.broadcast("Hello everyone!", { binary: false }, (err) => {
        if (err) console.error("Broadcast error:", err);
      });
      ```
- **Usage**: Used to group WebSocket connections for targeted communication, such as chat rooms or game lobbies.

### `JetWSChannel` Class

`JetWSChannel` extends `JetWSRoom` to provide named, potentially permanent channels for socket grouping.

- **Prototype**: `class JetWSChannel extends JetWSRoom`
- **Static Methods**:
  - `init(id: ChannelId, permanent = false): JetWSChannel` - Initialize a channel with an ID, optionally marking it as permanent.
    - **Parameters**:
      - `id`: Unique identifier for the channel (string, number, symbol).
      - `permanent`: Boolean to keep the channel even if empty.
    - **Example**:
      ```javascript
      const channel = Jet.WSChannel.init("general", true);
      ```
  - `get(id: ChannelId): JetWSChannel` - Retrieve or create a channel by ID.
    - **Example**:
      ```javascript
      const channel = Jet.WSChannel.get("general");
      ```
  - `tryGet(id: ChannelId): JetWSChannel | undefined` - Attempt to retrieve a channel by ID without creating it.
    - **Example**:
      ```javascript
      const channel = Jet.WSChannel.tryGet("general");
      if (channel) console.log("Channel exists");
      ```
  - `clean(): void` - Remove non-permanent empty channels.
    - **Example**:
      ```javascript
      Jet.WSChannel.clean();
      ```
- **Properties**:
  - `id: ChannelId` - Unique identifier for the channel.
- **Usage**: Channels are useful for predefined, named groups of sockets, such as topic-specific chat channels.

### `JetSocket` Type

`JetSocket` extends `WebSocket` with additional properties and methods for room and channel management.

- **Prototype**: `type JetSocket = WebSocket & { ... }`
- **Properties**:
  - `rooms: BiSet<JetSocket, "sockets", JetWSRoom>` - Set of rooms the socket belongs to.
  - `roles: Readonly<Set<string | number | symbol>>` - Set of roles assigned to the socket.
- **Methods**:
  - `join(room: JetWSRoom): JetWSRoom` - Join a room.
  - `join(channelId: ChannelId): JetWSChannel` - Join a channel by ID.
    - **Example**:
      ```javascript
      socket.join(room);
      socket.join("general");
      ```
  - `leave(room: JetWSRoom): JetWSRoom` - Leave a room.
  - `leave(channelId: ChannelId): JetWSChannel | undefined` - Leave a channel by ID.
    - **Example**:
      ```javascript
      socket.leave(room);
      socket.leave("general");
      ```
- **Usage**: `JetSocket` is the type for WebSocket connections handled by Jet, providing methods to manage group memberships.

### `JetRequest` Type

`JetRequest` extends `http.IncomingMessage` with additional properties for easier request handling.

- **Prototype**: `type JetRequest<P extends ParamsDictionary = {}> = http.IncomingMessage<P> & NodeJS.ReadableStream`
- **Properties**:
  - `server: Jet` - Reference to the Jet server instance.
  - `urlObject: URL` - Parsed URL object of the request.
  - `ip: string` - Client IP address (supports forwarded IPs).
  - `ua: UAParser.IResult` - Parsed user agent information.
  - `charset: string` - Request charset (default "utf-8").
  - `protocol: string` - Request protocol (e.g., "http" or "https").
  - `cookies: Partial<{ [key: string]: string }>` - Parsed cookies.
  - `params: P` - Route parameters.
  - `body: undefined | null | number | string | { [key: string]: unknown } | unknown[] | IIncomingForm | Uint8Array` - Parsed request body.
  - `query: qs.ParsedQs | { [key: string]: unknown }` - Parsed query string.
  - `files?: formidable.Files<string>` - Uploaded files (for multipart requests).
- **Methods**:
  - `getHeader(name: string): string | undefined` - Get a request header value.
    - **Example**:
      ```javascript
      const auth = req.getHeader("Authorization");
      ```
- **Usage**: Used in route handlers to access detailed request information.

### `JetResponse` Type

`JetResponse` extends `http.ServerResponse` with convenience methods for response handling.

- **Prototype**: `type JetResponse = http.ServerResponse<http.IncomingMessage> & { req: http.IncomingMessage; } & NodeJS.WritableStream`
- **Methods**:
  - `send(data: any): this` - Send data as response (raw if string/Buffer, JSON otherwise).
    - **Example**:
      ```javascript
      res.send("Hello");
      ```
  - `sendFile(path: string, options?: send.SendOptions): Promise<this>` - Send a file as response.
    - **Example**:
      ```javascript
      await res.sendFile("./public/index.html");
      ```
  - `json(data: any): this` - Send JSON data.
    - **Example**:
      ```javascript
      res.json({ status: "ok" });
      ```
  - `type(type: string): this` - Set Content-Type header.
    - **Example**:
      ```javascript
      res.type("text/plain");
      ```
  - `status(code?: number, message?: string): this` - Set status code and optional message.
    - **Example**:
      ```javascript
      res.status(404, "Not Found");
      ```
  - `redirect(url: string, options?: RedirectOptions): this` - Redirect client to URL.
    - **Parameters**:
      - `url`: Target URL.
      - `options`: Optional object with `code` (default 302), `message`, and `content`.
    - **Example**:
      ```javascript
      res.redirect("/login", { code: 301 });
      ```
  - `setCookie(name: string, value: string, options?: SerializeOptions): this` - Set a cookie.
    - **Example**:
      ```javascript
      res.setCookie("session", "abc123", { maxAge: 3600 });
      ```
  - `removeCookie(name: string, options?: SerializeOptions): this` - Remove a cookie.
    - **Example**:
      ```javascript
      res.removeCookie("session");
      ```
- **Usage**: Used in route handlers to craft responses to clients.

## Middleware Detailed Usage

Jet provides several middleware functions to handle common web development tasks. Each middleware can be applied globally with `app.use()` or to specific routes.

### `cors` Middleware

Handles Cross-Origin Resource Sharing (CORS) to allow cross-domain requests.

- **Function**: `cors(options: JetCORSOptions = {}): JetRouteHandler`
- **Parameters**:
  - `options: JetCORSOptions` - Configuration object with:
    - `credentials?: true` - Allow credentials (default: true). Sets `Access-Control-Allow-Credentials` header.
    - `origin?: string` - Allowed origin (default: "_"). If "_", uses request's referer or origin.
    - `methods?: string[]` - Allowed methods (default: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]).
    - `headers?: string[]` - Allowed headers (default: "\*").
- **Behavior**: Sets CORS headers on responses. For OPTIONS requests, responds with 204 status and no content.
- **Example**:
  ```javascript
  const Jet = require("jet");
  const app = new Jet();
  app.use(
    Jet.cors({
      credentials: true,
      origin: "http://example.com",
      methods: ["GET", "POST"],
      headers: ["Content-Type", "Authorization"],
    })
  );
  app.get("/", (req, res) => {
    res.send("CORS enabled endpoint");
  });
  app.listen(3000);
  ```

### `bodyParser` Middleware

Parses request bodies based on content type, supporting JSON, URL-encoded, multipart, buffer, and text formats.

- **Function**: `bodyParser(options: Partial<{ defaultContentType?: ContentType; json?: Parameters<typeof json>; urlencoded?: Parameters<typeof urlencoded>; multipart?: Parameters<typeof multipart>; buffer?: Parameters<typeof buffer>; text?: Parameters<typeof text>; }> = {}): JetRouteHandler`
- **Parameters**:
  - `options`: Configuration object with:
    - `defaultContentType?: ContentType` - Fallback content type if header is missing (e.g., "json").
    - `json?: Parameters<typeof json>` - Options for JSON parser (e.g., reviver function for `JSON.parse`).
    - `urlencoded?: Parameters<typeof urlencoded>` - Options for URL-encoded parser (e.g., `qs.IParseOptions`).
    - `multipart?: Parameters<typeof multipart>` - Options for multipart parser (e.g., `formidable.Options` or a function returning options based on request).
    - `buffer?: Parameters<typeof buffer>` - Options for buffer parser (currently none).
    - `text?: Parameters<typeof text>` - Options for text parser (currently none).
- **Behavior**: Parses the request body based on `Content-Type` header or default type. Skips parsing for GET, HEAD, TRACE methods or if already parsed. Stores result in `req.body` and `req.files` (for multipart).
- **Sub-Functions**:
  - `bodyParser.json(reviver?: Parameters<typeof JSON.parse>[1]): JetRouteHandler` - Parse JSON bodies.
    - **Example**:
      ```javascript
      app.use(
        Jet.bodyParser.json((key, value) => {
          if (key === "date") return new Date(value);
          return value;
        })
      );
      ```
  - `bodyParser.urlencoded(options?: qs.IParseOptions<qs.BooleanOptional>): JetRouteHandler` - Parse URL-encoded bodies.
    - **Example**:
      ```javascript
      app.use(Jet.bodyParser.urlencoded({ depth: 5 }));
      ```
  - `bodyParser.multipart(options?: Partial<formidable.Options> | ((req: JetRequest) => Partial<formidable.Options> | undefined) | ((req: JetRequest) => Promise<Partial<formidable.Options> | undefined>)): JetRouteHandler` - Parse multipart form data.
    - **Example**:
      ```javascript
      app.use(Jet.bodyParser.multipart({ maxFileSize: 2000000 }));
      app.use(
        Jet.bodyParser.multipart((req) => ({
          uploadDir: `./uploads/${req.params.userId}`,
        }))
      );
      ```
  - `bodyParser.buffer(): JetRouteHandler` - Parse body as raw buffer.
    - **Example**:
      ```javascript
      app.use(Jet.bodyParser.buffer());
      ```
  - `bodyParser.text(): JetRouteHandler` - Parse body as text.
    - **Example**:
      ```javascript
      app.use(Jet.bodyParser.text());
      ```
- **Example**:
  ```javascript
  const Jet = require("jet");
  const app = new Jet();
  app.use(
    Jet.bodyParser({
      defaultContentType: "json",
      json: [
        /* custom reviver */
      ],
      multipart: [{ maxFileSize: 1000000 }],
    })
  );
  app.post("/upload", (req, res) => {
    res.json({ body: req.body, files: req.files });
  });
  app.listen(3000);
  ```

### `mergeQuery` Middleware

Merges request body parameters into query parameters.

- **Function**: `mergeQuery(options: Partial<{ overwrite: boolean; }> = {}): JetRouteHandler`
- **Parameters**:
  - `options`: Configuration object with:
    - `overwrite: boolean` - If true, body parameters overwrite query parameters (default: true). If false, body parameters are only added if the key doesn't exist in query.
- **Behavior**: Combines `req.body` into `req.query`, with overwrite behavior based on the option.
- **Example**:
  ```javascript
  const Jet = require("jet");
  const app = new Jet();
  app.use(Jet.bodyParser());
  app.use(Jet.mergeQuery({ overwrite: false }));
  app.post("/form", (req, res) => {
    res.json({ query: req.query }); // Includes body data
  });
  app.listen(3000);
  ```

### `noCache` Middleware

Sets headers to prevent client-side caching of responses.

- **Function**: `noCache(): JetRouteHandler`
- **Parameters**: None.
- **Behavior**: Sets `Cache-Control`, `Pragma`, and `Expires` headers to disable caching.
- **Example**:
  ```javascript
  const Jet = require("jet");
  const app = new Jet();
  app.use(Jet.noCache());
  app.get("/dynamic", (req, res) => {
    res.send("This content should not be cached");
  });
  app.listen(3000);
  ```

## Utility Exports

Jet also exports several utility functions and libraries for direct use:

- `http`: Node.js `http` module with Jet's enhancements.
- `qs`: Query string parsing library with custom decoder for boolean/numeric values.
- `send`: Library for sending files.
- `mime`: MIME type lookup utility.
- `cookie`: Cookie parsing and serialization library.
- `formidable`: Library for parsing multipart form data.
- `UAParser`: User agent parsing library.
- `WebSocket`: WebSocket client/server library with Jet enhancements.
- `BiSet`: Bidirectional set utility for managing relationships (used internally for rooms).

## Comprehensive Usage Examples

### Full HTTP Server Setup with Middleware and Routes

```javascript
const Jet = require("jet");

const app = new Jet({
  errorHandler: (req, res, error) => {
    console.error("Error:", error);
    res.status(500).json({ error: "Server error" });
  },
});

// Apply middleware
app.use(Jet.cors({ origin: "http://localhost:8080" }));
app.use(Jet.bodyParser({ defaultContentType: "json" }));
app.use(Jet.mergeQuery());
app.use(Jet.noCache());

// Define routes
app.get("/", (req, res) => {
  res.send("Welcome to Jet Server");
});

app.get("/user/:id", (req, res) => {
  res.json({ userId: req.params.id, query: req.query });
});

app.post("/data", (req, res) => {
  res.json({ received: req.body });
});

// Serve static files
app.static("/public", "./public", { index: ["index.html"] });

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

### Advanced WebSocket Server with Rooms and Channels

```javascript
const Jet = require("jet");

const app = new Jet();

// WebSocket route for chat
app.ws("/chat/:roomId", (socket, req, head) => {
  const roomId = req.params.roomId;
  const room = new Jet.WSRoom(
    (soc) =>
      console.log(`Socket ${soc._socket.remoteAddress} joined room ${roomId}`),
    (soc) =>
      console.log(`Socket ${soc._socket.remoteAddress} left room ${roomId}`)
  );
  socket.join(room);

  socket.on("message", (data) => {
    console.log(`Broadcasting in room ${roomId}:`, data);
    room.broadcast(data, { binary: false });
  });

  socket.on("close", () => {
    console.log("Socket closed");
  });
});

// WebSocket route for channels
app.ws("/channel/:channelId", (socket, req, head) => {
  const channelId = req.params.channelId;
  const channel = Jet.WSChannel.get(channelId);
  socket.join(channel);

  socket.on("message", (data) => {
    channel.broadcast(data);
  });
});

// Set heartbeat for WebSocket server
app.wss.setHeartbeat(30000, 5000);

// Start server
app.listen(3000, () => {
  console.log("WebSocket server running on http://localhost:3000");
});
```

### Handling File Uploads with Multipart Middleware

```javascript
const Jet = require("jet");

const app = new Jet();

app.use(
  Jet.bodyParser.multipart({ uploadDir: "./uploads", maxFileSize: 5000000 })
);

app.post("/upload", (req, res) => {
  if (req.files && req.files.file) {
    res.json({ message: "File uploaded", file: req.files.file });
  } else {
    res.status(400).json({ error: "No file uploaded" });
  }
});

app.listen(3000, () => {
  console.log("Upload server running on http://localhost:3000");
});
```

## Problem Solving with Jet

Jet addresses several challenges in web server development:

- **Lightweight Alternative**: Provides a minimalistic framework compared to heavier alternatives, giving developers direct control over HTTP and WebSocket interactions.
- **Integrated WebSocket Support**: Simplifies real-time application development with built-in room and channel management, avoiding the need for separate libraries.
- **Flexible Middleware**: Offers pre-built solutions for common tasks like CORS and body parsing, reducing boilerplate code.
- **Type Safety**: Full TypeScript support ensures better code reliability and IDE assistance.

This documentation covers every aspect of Jet, from core classes and methods to middleware configurations and practical examples, equipping developers with the knowledge to build robust web applications using this framework.
