export class BiSet<
  Self,
  K extends keyof T,
  T extends { [key in K]: Set<Self> }
> extends Set<T> {
  readonly self: Self;
  readonly key: K;

  onadd?: (item: T) => void;
  ondelete?: (item: T) => void;

  constructor(
    self: Self,
    key: K,
    iterable?: Iterable<T> | null | undefined,
    onadd?: (item: T) => void,
    ondelete?: (item: T) => void
  );
  constructor(
    self: Self,
    key: K,
    values?: readonly T[] | null | undefined,
    onadd?: (item: T) => void,
    ondelete?: (item: T) => void
  );
  constructor(
    self: Self,
    key: K,
    init?: Iterable<T> | readonly T[] | null | undefined,
    onadd?: (item: T) => void,
    ondelete?: (item: T) => void
  ) {
    super(init);
    this.self = self;
    this.key = key;
    this.onadd = onadd;
    this.ondelete = ondelete;
    if (init) for (const i of init) this.add(i);
  }

  add(value: T) {
    try {
      if (!this.has(value) && this.onadd) this.onadd(value);
      return super.add(value);
    } finally {
      if (!value[this.key].has(this.self)) value[this.key].add(this.self);
    }
  }

  delete(value: T) {
    try {
      if (this.has(value) && this.ondelete) this.ondelete(value);
      return super.delete(value);
    } finally {
      if (value[this.key].has(this.self)) value[this.key].delete(this.self);
    }
  }

  clear() {
    const { self, key } = this;
    if (this.ondelete) {
      for (const i of this) {
        this.ondelete(i);
        i[key].delete(self);
      }
    } else {
      for (const i of this) {
        i[key].delete(self);
      }
    }
    return super.clear();
  }
}
