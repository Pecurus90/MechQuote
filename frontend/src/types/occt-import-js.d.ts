// occt-import-js non ha type definitions: shim minimale per l'uso che ne
// facciamo (ReadStepFile → meshes). Vedi StepViewerModal.
declare module 'occt-import-js' {
  interface OcctAttribute { array: number[] }
  interface OcctMesh {
    name?: string
    color?: [number, number, number]
    attributes: { position: OcctAttribute; normal?: OcctAttribute }
    index: { array: number[] }
  }
  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }
  interface OcctModule {
    ReadStepFile: (content: Uint8Array, params: unknown) => OcctResult
  }
  const factory: (opts?: { locateFile?: (path: string) => string }) => Promise<OcctModule>
  export default factory
}

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const url: string
  export default url
}
