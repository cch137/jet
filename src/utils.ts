export function computedPropDefine<P, T>(
  prototype: P,
  key: PropertyKey,
  getter: (obj: P) => T
) {
  Object.defineProperty(prototype, key, {
    get() {
      const value = getter(this);
      Object.defineProperty(this, key, { value, writable: false });
      return value;
    },
    configurable: true,
  });
}
