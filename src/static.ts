import type { JetRequest, JetResponse } from "./http";
import type { RouteHandler, RouteNextHandler } from "./route";
import { RouteBase } from "./route";
import { readFileSync, statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";

type ServeStaticOptions = Partial<{
  index: string | string[];
}>;

export class StaticRoute extends RouteBase {
  index: string[];
  dirname: string;

  constructor(
    dirname: string,
    options: ServeStaticOptions = {},
    handler?: RouteHandler
  ) {
    super(void 0, void 0, handler);
    const { index } = options;
    this.index = index ? (Array.isArray(index) ? index : [index]) : [];
    this.dirname = dirname;
  }

  handle(
    req: JetRequest,
    res: JetResponse,
    next: RouteNextHandler,
    root: string = "",
    currentPattern: string = ""
  ) {
    try {
      const pathaname = req._url.pathname;
      const filepath = relative(currentPattern, pathaname);
      const absFilepath = join(this.dirname, filepath);
      if (existsSync(absFilepath)) {
        const stat = statSync(absFilepath);
        if (stat.isFile()) return res.send(readFileSync(absFilepath));
        const { index } = this;
        if (stat.isDirectory() && index.length) {
          for (const filename of index) {
            const indexFilepath = join(absFilepath, filename);
            const stat = statSync(indexFilepath);
            if (stat.isFile())
              return pathaname.endsWith("/")
                ? res.send(readFileSync(indexFilepath))
                : res.redirect(`${pathaname}/`);
          }
        }
      }
    } catch (e) {
      console.error(e);
      return res.status(500).end();
    }
    return super.handle(req, res, next, root, currentPattern);
  }
}

function serveStatic(dirname: string, handler?: RouteHandler): StaticRoute;
function serveStatic(
  dirname: string,
  options?: ServeStaticOptions,
  handler?: RouteHandler
): StaticRoute;
function serveStatic(
  dirname: string,
  _options?: ServeStaticOptions | RouteHandler,
  _handler?: RouteHandler
): StaticRoute {
  const handler = [_handler, _options].find((i) => typeof i === "function") as
    | RouteHandler
    | undefined;
  const options = typeof _options === "object" ? _options : {};
  return new StaticRoute(resolve(dirname), options, handler);
}

export default serveStatic;
