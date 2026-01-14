const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');

const MM_TO_PT = 72 / 25.4;

// Layout constants (mm unless noted): Letter page, 0.5" margins, CR80 cards.
const LAYOUT = {
  page: { widthMm: 215.9, heightMm: 279.4 },
  marginMm: 12.7,
  card: { widthMm: 85.6, heightMm: 53.98, radiusMm: 2.5 },
  gapMm: 6,
  paddingMm: 5,
  header: { heightMm: 9, textPadLeftMm: 3.5, fontSizePt: 9.5 },
  border: { outerWidthPt: 0.75, innerInsetMm: 1, innerWidthPt: 0.5 },
  qr: { sizeMm: 40 },
  text: {
    gapFromQrMm: 5,
    rightInsetMm: 5,
    label: 'AOC YOUTH',
    labelSizePt: 7.5,
    labelGapMm: 1.5
  },
  name: { maxPt: 16, minPt: 12 }
};

const COLORS = {
  borderOuter: rgb(0.82, 0.82, 0.82),
  borderInner: rgb(0.9, 0.9, 0.9),
  headerFill: rgb(0.96, 0.96, 0.96),
  textPrimary: rgb(0.1, 0.1, 0.1),
  textLabel: rgb(0.5, 0.5, 0.5)
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

function formatStudentName(rawName) {
  if (!rawName) {
    return '';
  }
  const parts = String(rawName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] || '';
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last ? `${last[0].toUpperCase()}.` : '';
  return `${first} ${initial}`.trim();
}

function roundedRectPath(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z'
  ].join(' ');
}

function topRoundedRectPath(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height}`,
    'H 0',
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z'
  ].join(' ');
}

function drawRoundedRect(page, { x, top, width, height, radius, fillColor, borderColor, borderWidth }) {
  const path = roundedRectPath(width, height, radius);
  page.drawSvgPath(path, {
    x,
    y: top,
    color: fillColor,
    borderColor,
    borderWidth
  });
}

function drawTopRoundedRect(page, { x, top, width, height, radius, fillColor }) {
  const path = topRoundedRectPath(width, height, radius);
  page.drawSvgPath(path, {
    x,
    y: top,
    color: fillColor
  });
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
    margin: 4,
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
  const headerHeight = mmToPt(LAYOUT.header.heightMm);
  const padding = mmToPt(LAYOUT.paddingMm);
  const radius = mmToPt(LAYOUT.card.radiusMm);
  const labelGap = mmToPt(LAYOUT.text.labelGapMm);

  for (let index = 0; index < students.length; index += 1) {
    if (index % capacity === 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
    }

    const slot = index % capacity;
    const row = Math.floor(slot / cols);
    const col = slot % cols;

    const cardX = margin + col * (cardWidth + gap);
    const cardY = pageHeight - margin - cardHeight - row * (cardHeight + gap);

    const cardTop = cardY + cardHeight;
    drawRoundedRect(page, {
      x: cardX,
      top: cardTop,
      width: cardWidth,
      height: cardHeight,
      radius,
      fillColor: rgb(1, 1, 1)
    });

    drawTopRoundedRect(page, {
      x: cardX,
      top: cardTop,
      width: cardWidth,
      height: headerHeight,
      radius,
      fillColor: COLORS.headerFill
    });

    const student = students[index];
    const qrText = `${baseUrl}/s/${student.qr_id}`;
    const qrPng = await buildQrPng(qrText);
    const qrImage = await pdfDoc.embedPng(qrPng);

    const qrSize = mmToPt(LAYOUT.qr.sizeMm);
    const qrX = cardX + padding;
    const contentTop = cardTop - headerHeight;
    const contentBottom = cardY + padding;
    const contentCenter = (contentTop + contentBottom) / 2;
    const qrY = contentCenter - qrSize / 2;
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize
    });

    const textLeft = qrX + qrSize + mmToPt(LAYOUT.text.gapFromQrMm);
    const textMaxWidth = cardX + cardWidth - mmToPt(LAYOUT.text.rightInsetMm) - textLeft;
    const safeTextWidth = Math.max(10, textMaxWidth);
    const displayName = formatStudentName(student.name);
    const fittedName = fitText(fontBold, displayName, safeTextWidth, LAYOUT.name.maxPt, LAYOUT.name.minPt);

    const contentHeight = contentTop - contentBottom;
    const labelSize = LAYOUT.text.label ? LAYOUT.text.labelSizePt : 0;
    const labelBlock = LAYOUT.text.label ? labelSize + labelGap : 0;
    const blockHeight = labelBlock + fittedName.size;
    const blockTop = contentTop - (contentHeight - blockHeight) / 2;
    let cursorY = blockTop;

    if (LAYOUT.text.label) {
      const labelY = cursorY - labelSize;
      page.drawText(LAYOUT.text.label, {
        x: textLeft,
        y: labelY,
        size: labelSize,
        font: fontRegular,
        color: COLORS.textLabel
      });
      cursorY = labelY - labelGap;
    }

    const nameY = cursorY - fittedName.size;
    page.drawText(fittedName.text, {
      x: textLeft,
      y: nameY,
      size: fittedName.size,
      font: fontBold,
      color: COLORS.textPrimary
    });

    const headerTextY =
      cardTop - headerHeight + (headerHeight - LAYOUT.header.fontSizePt) / 2;
    page.drawText('The Storehouse', {
      x: cardX + mmToPt(LAYOUT.header.textPadLeftMm),
      y: headerTextY,
      size: LAYOUT.header.fontSizePt,
      font: fontBold,
      color: COLORS.textPrimary
    });

    const innerInset = mmToPt(LAYOUT.border.innerInsetMm);
    const innerRadius = Math.max(0, radius - innerInset);
    drawRoundedRect(page, {
      x: cardX + innerInset,
      top: cardTop - innerInset,
      width: cardWidth - innerInset * 2,
      height: cardHeight - innerInset * 2,
      radius: innerRadius,
      borderColor: COLORS.borderInner,
      borderWidth: LAYOUT.border.innerWidthPt
    });

    drawRoundedRect(page, {
      x: cardX,
      top: cardTop,
      width: cardWidth,
      height: cardHeight,
      radius,
      borderColor: COLORS.borderOuter,
      borderWidth: LAYOUT.border.outerWidthPt
    });
  }

  return pdfDoc.save();
}

module.exports = {
  generateStudentCardsPdf,
  LAYOUT
};
