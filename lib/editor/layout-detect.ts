import type { TemplateId } from "@/modules/applications/components/editor/types"

export interface DetectedLayout {
    columnCount: 1 | 2
    hasPhoto: boolean
    hasSidebar: boolean
    confidence: number
    suggestedTemplate: TemplateId
}

interface PdfLayoutItem {
    x?: number
    y?: number
    w?: number
    h?: number
}

interface PdfLayoutPage {
    Width?: number
    Height?: number
    Texts?: PdfLayoutItem[]
    Fills?: PdfLayoutItem[]
    Images?: PdfLayoutItem[]
}

interface PdfLayoutData {
    Pages?: PdfLayoutPage[]
}

const DEFAULT_LAYOUT: DetectedLayout = {
    columnCount: 1,
    hasPhoto: false,
    hasSidebar: false,
    confidence: 0.5,
    suggestedTemplate: 'modern',
}

/**
 * Run heuristic layout detection on a PDF buffer using pdf2json positional data.
 *
 * Heuristics:
 *   - Cluster x-positions of all text fragments on the first page; if a clear
 *     bimodal distribution exists with both clusters dense, treat as 2-column.
 *   - If the left cluster spans < 35% of page width AND has high text density,
 *     mark as sidebar.
 *   - If `Fills` (image fills) appear in the top 20% of the first page, mark
 *     as photo header.
 *
 * Output is best-effort. Confidence reflects strength of clustering.
 */
export async function detectPdfLayout(buffer: Buffer): Promise<DetectedLayout> {
    try {
        const PDFParser = (await import("pdf2json")).default

        const pdf: PdfLayoutData = await new Promise((resolve, reject) => {
            const parser = new PDFParser()
            parser.on("pdfParser_dataReady", resolve)
            parser.on("pdfParser_dataError", reject)
            try {
                parser.parseBuffer(buffer)
            } catch (e) {
                reject(e)
            }
        })

        if (!pdf?.Pages?.length) return DEFAULT_LAYOUT
        const firstPage = pdf.Pages[0]
        const pageHeight = firstPage.Height ?? 80

        const xs: number[] = []
        for (const t of firstPage.Texts ?? []) {
            if (typeof t.x === 'number') xs.push(t.x)
        }
        if (xs.length < 10) return DEFAULT_LAYOUT

        xs.sort((a, b) => a - b)
        const minX = xs[0]
        const maxX = xs[xs.length - 1]
        const range = maxX - minX || 1

        // Bin x positions into 10 buckets across page width
        const buckets = new Array(10).fill(0)
        for (const x of xs) {
            const idx = Math.min(9, Math.floor(((x - minX) / range) * 10))
            buckets[idx]++
        }
        const total = xs.length
        const left = buckets.slice(0, 4).reduce((a, b) => a + b, 0)
        const middle = buckets.slice(4, 6).reduce((a, b) => a + b, 0)
        const right = buckets.slice(6, 10).reduce((a, b) => a + b, 0)

        // 2-column heuristic: left + right both > 25%, middle < 15%
        const leftRatio = left / total
        const rightRatio = right / total
        const middleRatio = middle / total
        const isTwoColumn = leftRatio > 0.25 && rightRatio > 0.25 && middleRatio < 0.18

        // Sidebar: left cluster x-range narrow vs page width
        const leftXs = xs.filter(x => (x - minX) / range < 0.4)
        const leftSpan = leftXs.length > 0 ? (leftXs[leftXs.length - 1] - leftXs[0]) / range : 0
        const isSidebar = isTwoColumn && leftSpan < 0.25 && leftRatio > 0.2

        // Photo detection: look for image fills in top 20% of page
        let hasPhoto = false
        const fills = firstPage.Fills ?? []
        const images = firstPage.Images ?? []
        for (const item of [...fills, ...images]) {
            if (typeof item.y === 'number' && item.y < pageHeight * 0.2) {
                if (typeof item.w === 'number' && typeof item.h === 'number' && item.w > 2 && item.h > 2) {
                    hasPhoto = true
                    break
                }
            }
        }

        const confidence = Math.min(1, Math.max(0.5, Math.abs(leftRatio - rightRatio) < 0.1 && isTwoColumn ? 0.85 : 0.65))

        let suggested: TemplateId = 'modern'
        if (hasPhoto) suggested = 'photo-header'
        else if (isSidebar) suggested = 'two-column'
        else if (isTwoColumn) suggested = 'two-column'

        return {
            columnCount: isTwoColumn ? 2 : 1,
            hasPhoto,
            hasSidebar: isSidebar,
            confidence,
            suggestedTemplate: suggested,
        }
    } catch (error) {
        console.warn("Layout detection failed:", error)
        return DEFAULT_LAYOUT
    }
}
