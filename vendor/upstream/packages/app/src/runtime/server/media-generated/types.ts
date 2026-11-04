export type InvalidRequestError = {
  readonly _tag: "InvalidRequestError"
  readonly message: string
  readonly kind?: string | undefined
  readonly field?: string | undefined
}
export const isInvalidRequestError = (value: unknown): value is InvalidRequestError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidRequestError"

export type UnauthorizedError = { readonly _tag: "UnauthorizedError"; readonly message: string }
export const isUnauthorizedError = (value: unknown): value is UnauthorizedError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnauthorizedError"

export type FileNotFoundError = { readonly _tag: "FileNotFoundError"; readonly path: string; readonly message: string }
export const isFileNotFoundError = (value: unknown): value is FileNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "FileNotFoundError"

export type ExperimentalMediaGetInput = { readonly hash: string }

export type ExperimentalMediaGetOutput = globalThis.Uint8Array
