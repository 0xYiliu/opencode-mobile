/** RFC 7617 Basic token encoding over UTF-8 bytes (not btoa's Latin-1 code units). */
export function basicAuthToken(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ""
  const CHUNK_SIZE = 0x8000
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }
  return btoa(binary)
}
