/**
 * A Java exception the ported code throws where the Java code throws, so callers and fixtures can
 * see the same failure (`{"error": SimpleClassName, "message": ...}` in the kana fixtures).
 */
export class JavaException extends Error {
  /** The Java exception's simple class name, e.g. `StringIndexOutOfBoundsException`. */
  readonly javaClass: string;

  constructor(javaClass: string, message: string) {
    super(message);
    this.name = javaClass;
    this.javaClass = javaClass;
  }
}

/** Java's `String.charAt` failure for index `i` on a string of `length` chars (JDK 21 message). */
export function stringIndexOutOfBounds(i: number, length: number): JavaException {
  return new JavaException('StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${length}`);
}
