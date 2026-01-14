const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const MM_TO_PT = 72 / 25.4;

// Layout constants (mm): Letter page, 0.5" margins, CR80 cards, 6mm gaps, 40mm QR.
const LAYOUT = {
  page: { widthMm: 215.9, heightMm: 279.4 },
  marginMm: 12.7,
  card: { widthMm: 85.6, heightMm: 53.98 },
  gapMm: 6,
  borderInsetMm: 1,
  borderWidthMm: 0.3,
  qr: { sizeMm: 40, topOffsetMm: 6, gapBelowMm: 4 },
  name: { maxPt: 16, minPt: 12 },
  footer: { sizePt: 8, offsetMm: 3 }
};

function mmToPt(mm) {
  return mm * MM_TO_PT;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fitText(font, text, maxWidth, maxSize, minSize) {
  let size = maxSize;
  let width = font.widthOfTextAtSize(text, size);
  if (width <= maxWidth) {
    return { text, size };
  }

  size = clamp((maxWidth / width) * size, minSize, maxSize);
  width = font.widthOfTextAtSize(text, size);
  if (width <= maxWidth) {
    return { text, size };
  }

  if (size > minSize) {
    size = minSize;
  }

  let trimmed = text;
  const ellipsis = '...';
  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    const candidate = trimmed + ellipsis;
    width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      return { text: candidate, size };
    }
  }

  return { text: text.slice(0, 1) + ellipsis, size };
}

function getGrid(pageWidth, pageHeight) {
  const margin = mmToPt(LAYOUT.marginMm);
  const cardWidth = mmToPt(LAYOUT.card.widthMm);
  const cardHeight = mmToPt(LAYOUT.card.heightMm);
  const gap = mmToPt(LAYOUT.gapMm);

  const availableWidth = pageWidth - 2 * margin;
  const availableHeight = pageHeight - 2 * margin;

  const cols = Math.max(1, Math.floor((availableWidth + gap) / (cardWidth + gap)));
  const rows = Math.max(1, Math.floor((availableHeight + gap) / (cardHeight + gap)));

  return {
    margin,
    cardWidth,
    cardHeight,
    gap,
    cols,
    rows,
    capacity: cols * rows
  };
}

async function buildQrPng(text) {
  const sizeInches = LAYOUT.qr.sizeMm / 25.4;
  const pixelSize = Math.ceil(sizeInches * 300);
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: pixelSize,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}

async function generateStudentCardsPdf({ students, baseUrl }) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = mmToPt(LAYOUT.page.widthMm);
  const pageHeight = mmToPt(LAYOUT.page.heightMm);
  const { margin, cardWidth, cardHeight, gap, cols, rows, capacity } = getGrid(pageWidth, pageHeight);

  let page = null;

  for (let index = 0; index < students.length; index += 1) {
    if (index % capacity === 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
    }

    const slot = index % capacity;
    const row = Math.floor(slot / cols);
    const col = slot % cols;

    const cardX = margin + col * (cardWidth + gap);
    const cardY = pageHeight - margin - cardHeight - row * (cardHeight + gap);

    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      color: rgb(1, 1, 1)
    });

    const borderInset = mmToPt(LAYOUT.borderInsetMm);
    page.drawRectangle({
      x: cardX + borderInset,
      y: cardY + borderInset,
      width: cardWidth - borderInset * 2,
      height: cardHeight - borderInset * 2,
      borderWidth: mmToPt(LAYOUT.borderWidthMm),
      borderColor: rgb(0.85, 0.85, 0.85)
    });

    const student = students[index];
    const qrText = `${baseUrl}/s/${student.qr_id}`;
    const qrPng = await buildQrPng(qrText);
    const qrImage = await pdfDoc.embedPng(qrPng);

    const qrSize = mmToPt(LAYOUT.qr.sizeMm);
    const qrX = cardX + (cardWidth - qrSize) / 2;
    const qrY = cardY + cardHeight - mmToPt(LAYOUT.qr.topOffsetMm) - qrSize;
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize
    });

    const nameMaxWidth = cardWidth - mmToPt(8);
    const fittedName = fitText(fontBold, student.name, nameMaxWidth, LAYOUT.name.maxPt, LAYOUT.name.minPt);
    const nameWidth = fontBold.widthOfTextAtSize(fittedName.text, fittedName.size);
    const nameX = cardX + (cardWidth - nameWidth) / 2;
    const nameY = qrY - mmToPt(LAYOUT.qr.gapBelowMm) - fittedName.size;

    page.drawText(fittedName.text, {
      x: nameX,
      y: nameY,
      size: fittedName.size,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });

    const footerText = 'The Storehouse';
    const footerSize = LAYOUT.footer.sizePt;
    const footerWidth = fontRegular.widthOfTextAtSize(footerText, footerSize);
    const footerX = cardX + (cardWidth - footerWidth) / 2;
    const footerY = cardY + mmToPt(LAYOUT.footer.offsetMm);
    page.drawText(footerText, {
      x: footerX,
      y: footerY,
      size: footerSize,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6)
    });
  }

  return pdfDoc.save();
}

module.exports = {
  generateStudentCardsPdf,
  LAYOUT
};
