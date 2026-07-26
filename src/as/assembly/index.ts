// AssemblyScript – a TypeScript-like language that compiles to WebAssembly.
// Types are mandatory and map directly to WebAssembly numeric types.

// i32  → 32-bit integer
// f64  → 64-bit float (closest to JS number)

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;
  let a: i32 = 0;
  let b: i32 = 1;
  for (let i: i32 = 2; i <= n; i++) {
    const tmp: i32 = a + b;
    a = b;
    b = tmp;
  }
  return b;
}

// Multiplies two n×n matrices of f64 values stored in flat row-major arrays.
// A and B are filled with deterministic values; returns a checksum of the
// result matrix so the compiler can't eliminate the computation as dead code.
//
// This is a reliable WASM showcase because:
//   • The entire hot path is a triple-nested multiply-accumulate loop
//   • All data lives in WASM linear memory as typed f64s — no boxing, no GC
//   • The JS↔WASM boundary is crossed exactly once per benchmark call,
//     not once per element, so call overhead doesn't cancel the speedup
export function matMul(n: i32): f64 {
  const size: i32 = n * n;
  const A = new StaticArray<f64>(size);
  const B = new StaticArray<f64>(size);
  const C = new StaticArray<f64>(size);

  // Fill with simple deterministic values
  for (let i: i32 = 0; i < size; i++) {
    A[i] = f64(i % n) + 1.0;
    B[i] = f64(i / n) + 1.0;
  }

  // Standard O(n³) matrix multiply
  for (let row: i32 = 0; row < n; row++) {
    for (let col: i32 = 0; col < n; col++) {
      let sum: f64 = 0.0;
      for (let k: i32 = 0; k < n; k++) {
        sum += A[row * n + k] * B[k * n + col];
      }
      C[row * n + col] = sum;
    }
  }

  // Sum the result so the work can't be optimised away
  let checksum: f64 = 0.0;
  for (let i: i32 = 0; i < size; i++) {
    checksum += C[i];
  }
  return checksum;
}
