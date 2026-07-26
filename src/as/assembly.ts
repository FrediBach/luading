// Plain TypeScript implementations that mirror src/as/assembly/index.ts.
// Used by the benchmark runner to compare native JS execution against WASM.

export function add(a: number, b: number): number {
  return a + b
}

export function fibonacci(n: number): number {
  if (n <= 1) return n
  let a = 0
  let b = 1
  for (let i = 2; i <= n; i++) {
    const tmp = a + b
    a = b
    b = tmp
  }
  return b
}

// TypeScript mirror of the AssemblyScript matMul.
// Uses Float64Array (backed by an ArrayBuffer) to be as fair as possible —
// contiguous typed memory rather than a plain JS number array.
export function matMul(n: number): number {
  const size = n * n
  const A = new Float64Array(size)
  const B = new Float64Array(size)
  const C = new Float64Array(size)

  for (let i = 0; i < size; i++) {
    A[i] = (i % n) + 1
    B[i] = Math.floor(i / n) + 1
  }

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      let sum = 0
      for (let k = 0; k < n; k++) {
        sum += A[row * n + k] * B[k * n + col]
      }
      C[row * n + col] = sum
    }
  }

  let checksum = 0
  for (let i = 0; i < size; i++) checksum += C[i]
  return checksum
}
