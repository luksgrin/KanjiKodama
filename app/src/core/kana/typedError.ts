/**
 * An error with a type name, so callers and fixtures see the same failure
 * (`{"error": TypeName, "message": ...}` in the kana fixtures).
 */
export class TypedError extends Error {
  /** The error's type name, e.g. `StringIndexOutOfBoundsException`. */
  readonly errorType: string;

  constructor(errorType: string, message: string) {
    super(message);
    this.name = errorType;
    this.errorType = errorType;
  }
}

/** The out-of-range failure for index `i` on a string of `length` chars. */
export function stringIndexOutOfBounds(i: number, length: number): TypedError {
  return new TypedError('StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${length}`);
}
