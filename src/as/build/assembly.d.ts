declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  /**
   * src/as/assembly/index/add
   * @param a `i32`
   * @param b `i32`
   * @returns `i32`
   */
  export function add(a: number, b: number): number;
  /**
   * src/as/assembly/index/fibonacci
   * @param n `i32`
   * @returns `i32`
   */
  export function fibonacci(n: number): number;
  /**
   * src/as/assembly/index/matMul
   * @param n `i32`
   * @returns `f64`
   */
  export function matMul(n: number): number;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports: {
  env: unknown,
}): Promise<typeof __AdaptedExports>;
