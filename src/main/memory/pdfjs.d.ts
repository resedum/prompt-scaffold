/**
 * pdfjs-dist legacy 构建的最小类型声明。
 * 主进程动态 import，避免把 pdfjs 打包进 bundle（externalizeDepsPlugin 保持外部依赖）。
 */
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PdfTextContentItem {
    str?: string
  }
  export interface PdfTextContent {
    items: PdfTextContentItem[]
  }
  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>
  }
  export interface PdfDocumentProxy {
    numPages: number
    getPage(n: number): Promise<PdfPageProxy>
  }
  export function getDocument(opts: {
    data: Uint8Array
    [k: string]: unknown
  }): { promise: Promise<PdfDocumentProxy> }
  export const GlobalWorkerOptions: { workerSrc: string }
}
