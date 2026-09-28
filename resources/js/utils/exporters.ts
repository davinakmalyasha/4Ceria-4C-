/**
 * Shared client-side export helpers (CSV + simple text-table PDF).
 * jspdf is dynamically imported so it stays out of the main bundle.
 */

export function downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number | null | undefined)[][]
): void {
    const escape = (value: string | number | null | undefined) => {
        const str = value === null || value === undefined ? '' : String(value);
        return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
    // BOM keeps Excel happy with UTF-8 (Rp, Indonesian names).
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function downloadPdfTable(
    filename: string,
    title: string,
    headers: string[],
    rows: (string | number | null | undefined)[][]
): Promise<void> {
    const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const rowHeight = 18;
    let y = margin;

    doc.setFontSize(14);
    doc.text(title, margin, y);
    y += 12;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString('id-ID')}`, margin, y);
    y += 20;
    doc.setTextColor(0);

    const colWidth = (pageWidth - margin * 2) / Math.max(headers.length, 1);
    const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        headers.forEach((header, index) => {
            doc.text(String(header).slice(0, 28), margin + index * colWidth, y);
        });
        doc.setFont('helvetica', 'normal');
        y += rowHeight;
    };

    drawHeader();

    for (const row of rows) {
        if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
            drawHeader();
        }
        row.forEach((cell, index) => {
            const value = cell === null || cell === undefined ? '-' : String(cell);
            doc.text(value.slice(0, 28), margin + index * colWidth, y);
        });
        y += rowHeight;
    }

    doc.save(filename);
}
