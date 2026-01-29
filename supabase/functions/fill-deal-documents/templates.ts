// PDF Generation Templates - Creates forms from scratch matching official layouts
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// Colors
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);

// Helper to draw a labeled field
function drawField(
  page: any,
  font: any,
  boldFont: any,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  options: { labelSize?: number; valueSize?: number; underline?: boolean } = {}
) {
  const { labelSize = 8, valueSize = 10, underline = true } = options;

  // Label
  page.drawText(label, { x, y: y + 12, size: labelSize, font, color: GRAY });

  // Value
  page.drawText(value || '', { x, y, size: valueSize, font: boldFont, color: BLACK });

  // Underline
  if (underline) {
    page.drawLine({
      start: { x, y: y - 2 },
      end: { x: x + width, y: y - 2 },
      thickness: 0.5,
      color: LIGHT_GRAY,
    });
  }
}

// Helper to draw a section header
function drawSectionHeader(page: any, boldFont: any, text: string, x: number, y: number, width: number) {
  page.drawRectangle({
    x,
    y: y - 2,
    width,
    height: 16,
    color: rgb(0.95, 0.95, 0.95),
  });
  page.drawText(text, { x: x + 4, y: y + 2, size: 10, font: boldFont, color: BLACK });
}

// ============================================
// MOTOR VEHICLE CONTRACT OF SALE
// ============================================
export async function generateMVCS(data: {
  deal: any;
  vehicle: any;
  dealer: any;
  customer: any;
}): Promise<Uint8Array> {
  const { deal, vehicle, dealer, customer } = data;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  let y = height - 40;

  // Title
  page.drawText('MOTOR VEHICLE CONTRACT OF SALE', {
    x: width / 2 - 140,
    y,
    size: 16,
    font: boldFont,
    color: BLACK,
  });
  y -= 10;
  page.drawText('(Bill of Sale)', {
    x: width / 2 - 30,
    y,
    size: 10,
    font,
    color: GRAY,
  });
  y -= 30;

  // Dealer Info Section
  drawSectionHeader(page, boldFont, 'SELLER (DEALER) INFORMATION', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Dealer Name', dealer?.dealer_name || dealer?.name || '', 40, y, 250);
  drawField(page, font, boldFont, 'License #', dealer?.dealer_license || dealer?.license_number || '', 310, y, 120);
  drawField(page, font, boldFont, 'Phone', dealer?.phone || '', 450, y, 120);
  y -= 35;

  drawField(page, font, boldFont, 'Address', dealer?.address || '', 40, y, 200);
  drawField(page, font, boldFont, 'City', dealer?.city || '', 260, y, 120);
  drawField(page, font, boldFont, 'State', dealer?.state || '', 400, y, 50);
  drawField(page, font, boldFont, 'ZIP', dealer?.zip || '', 470, y, 90);
  y -= 45;

  // Buyer Info Section
  drawSectionHeader(page, boldFont, 'BUYER INFORMATION', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Buyer Name', deal?.purchaser_name || customer?.name || '', 40, y, 250);
  drawField(page, font, boldFont, 'Phone', deal?.customer_phone || customer?.phone || '', 310, y, 130);
  drawField(page, font, boldFont, 'Email', deal?.customer_email || customer?.email || '', 460, y, 110);
  y -= 35;

  drawField(page, font, boldFont, 'Address', customer?.address || '', 40, y, 200);
  drawField(page, font, boldFont, 'City', customer?.city || '', 260, y, 120);
  drawField(page, font, boldFont, 'State', customer?.state || '', 400, y, 50);
  drawField(page, font, boldFont, 'ZIP', customer?.zip || '', 470, y, 90);
  y -= 45;

  // Vehicle Info Section
  drawSectionHeader(page, boldFont, 'VEHICLE INFORMATION', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Year', vehicle?.year?.toString() || '', 40, y, 60);
  drawField(page, font, boldFont, 'Make', vehicle?.make || '', 120, y, 100);
  drawField(page, font, boldFont, 'Model', vehicle?.model || '', 240, y, 100);
  drawField(page, font, boldFont, 'Color', vehicle?.color || '', 360, y, 80);
  drawField(page, font, boldFont, 'Stock #', vehicle?.stock_number || '', 460, y, 100);
  y -= 35;

  drawField(page, font, boldFont, 'VIN', vehicle?.vin || '', 40, y, 200);
  drawField(page, font, boldFont, 'Odometer', (vehicle?.miles || vehicle?.mileage || '').toLocaleString() + ' miles', 260, y, 130);
  drawField(page, font, boldFont, 'Body Type', vehicle?.body_type || '', 410, y, 150);
  y -= 45;

  // Sale Information Section
  drawSectionHeader(page, boldFont, 'SALE INFORMATION', 40, y, width - 80);
  y -= 35;

  const salePrice = parseFloat(deal?.price) || 0;
  const tradeValue = parseFloat(deal?.trade_value) || 0;
  const tradePayoff = parseFloat(deal?.trade_payoff) || 0;
  const downPayment = parseFloat(deal?.down_payment) || 0;
  const docFee = parseFloat(deal?.doc_fee) || 299;
  const salesTaxRate = 0.0685;
  const taxableAmount = Math.max(0, salePrice - tradeValue);
  const salesTax = taxableAmount * salesTaxRate;
  const totalPrice = salePrice + docFee + salesTax - tradeValue;

  drawField(page, font, boldFont, 'Date of Sale', formatDate(deal?.date_of_sale), 40, y, 120);
  drawField(page, font, boldFont, 'Sale Price', formatCurrency(salePrice), 180, y, 100);
  drawField(page, font, boldFont, 'Doc Fee', formatCurrency(docFee), 300, y, 80);
  drawField(page, font, boldFont, 'Sales Tax', formatCurrency(salesTax), 400, y, 80);
  drawField(page, font, boldFont, 'Salesperson', deal?.salesman || '', 500, y, 70);
  y -= 35;

  if (tradeValue > 0) {
    drawField(page, font, boldFont, 'Trade Allowance', formatCurrency(tradeValue), 40, y, 100);
    drawField(page, font, boldFont, 'Trade Payoff', formatCurrency(tradePayoff), 160, y, 100);
    drawField(page, font, boldFont, 'Net Trade', formatCurrency(tradeValue - tradePayoff), 280, y, 100);
    y -= 35;
  }

  drawField(page, font, boldFont, 'Down Payment', formatCurrency(downPayment), 40, y, 100);
  page.drawText('TOTAL PRICE:', { x: 350, y, size: 12, font: boldFont, color: BLACK });
  page.drawText(formatCurrency(totalPrice), { x: 450, y, size: 14, font: boldFont, color: BLACK });
  y -= 45;

  // Financing Section (if BHPH or Financing)
  if (deal?.deal_type === 'BHPH' || deal?.deal_type === 'Financing') {
    drawSectionHeader(page, boldFont, 'FINANCING TERMS', 40, y, width - 80);
    y -= 35;

    const amountFinanced = totalPrice - downPayment;
    const termMonths = parseInt(deal?.term_months) || 48;
    const interestRate = parseFloat(deal?.interest_rate) || 18;
    const monthlyRate = interestRate / 100 / 12;
    const monthlyPayment = amountFinanced > 0 && monthlyRate > 0
      ? (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
      : amountFinanced / termMonths;
    const totalOfPayments = monthlyPayment * termMonths;
    const financeCharge = totalOfPayments - amountFinanced;

    drawField(page, font, boldFont, 'Amount Financed', formatCurrency(amountFinanced), 40, y, 110);
    drawField(page, font, boldFont, 'APR', interestRate.toFixed(2) + '%', 170, y, 60);
    drawField(page, font, boldFont, 'Term', termMonths + ' months', 250, y, 80);
    drawField(page, font, boldFont, 'Monthly Payment', formatCurrency(monthlyPayment), 350, y, 110);
    y -= 35;

    drawField(page, font, boldFont, 'Finance Charge', formatCurrency(financeCharge), 40, y, 110);
    drawField(page, font, boldFont, 'Total of Payments', formatCurrency(totalOfPayments), 170, y, 120);
    y -= 45;
  }

  // Legal Text
  y -= 10;
  const legalText = [
    'The undersigned Buyer acknowledges receipt of a copy of this contract at the time of signing.',
    'Buyer has inspected the vehicle and accepts it in its present condition.',
    'Seller warrants that they have good title to the vehicle and the right to sell it.',
  ];

  page.drawText('TERMS AND CONDITIONS:', { x: 40, y, size: 9, font: boldFont, color: BLACK });
  y -= 15;

  for (const line of legalText) {
    page.drawText('• ' + line, { x: 40, y, size: 8, font, color: GRAY });
    y -= 12;
  }

  // Signature Section
  y -= 20;
  page.drawLine({ start: { x: 40, y }, end: { x: 250, y }, thickness: 0.5, color: BLACK });
  page.drawText('Buyer Signature', { x: 40, y: y - 12, size: 8, font, color: GRAY });
  page.drawText('Date: ____________', { x: 180, y: y - 12, size: 8, font, color: GRAY });

  page.drawLine({ start: { x: 320, y }, end: { x: 530, y }, thickness: 0.5, color: BLACK });
  page.drawText('Dealer Signature', { x: 320, y: y - 12, size: 8, font, color: GRAY });
  page.drawText('Date: ____________', { x: 460, y: y - 12, size: 8, font, color: GRAY });

  // Footer
  page.drawText('Generated by OG Dealer Management System', {
    x: width / 2 - 100,
    y: 30,
    size: 8,
    font,
    color: GRAY,
  });

  return await pdfDoc.save();
}

// ============================================
// ODOMETER DISCLOSURE STATEMENT
// ============================================
export async function generateOdometerDisclosure(data: {
  deal: any;
  vehicle: any;
  dealer: any;
  customer: any;
}): Promise<Uint8Array> {
  const { deal, vehicle, dealer, customer } = data;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 40;

  // Title
  page.drawText('ODOMETER DISCLOSURE STATEMENT', {
    x: width / 2 - 120,
    y,
    size: 16,
    font: boldFont,
    color: BLACK,
  });
  y -= 15;
  page.drawText('Federal law (and State law) requires that you state the mileage upon transfer of ownership.', {
    x: 40,
    y,
    size: 9,
    font,
    color: GRAY,
  });
  y -= 30;

  // Vehicle Info
  drawSectionHeader(page, boldFont, 'VEHICLE INFORMATION', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Year', vehicle?.year?.toString() || '', 40, y, 60);
  drawField(page, font, boldFont, 'Make', vehicle?.make || '', 120, y, 120);
  drawField(page, font, boldFont, 'Model', vehicle?.model || '', 260, y, 120);
  drawField(page, font, boldFont, 'Body Type', vehicle?.body_type || '', 400, y, 160);
  y -= 35;

  drawField(page, font, boldFont, 'VIN', vehicle?.vin || '', 40, y, 520);
  y -= 45;

  // Odometer Reading
  drawSectionHeader(page, boldFont, 'ODOMETER READING', 40, y, width - 80);
  y -= 40;

  const miles = vehicle?.miles || vehicle?.mileage || 0;
  page.drawText('I, ' + (dealer?.dealer_name || 'the seller') + ', state that the odometer now reads:', {
    x: 40,
    y,
    size: 10,
    font,
    color: BLACK,
  });
  y -= 25;

  page.drawText(miles.toLocaleString(), { x: 80, y, size: 24, font: boldFont, color: BLACK });
  page.drawText('miles', { x: 200, y: y + 5, size: 12, font, color: BLACK });
  y -= 30;

  page.drawText('(no tenths) and to the best of my knowledge the odometer reading:', {
    x: 40,
    y,
    size: 10,
    font,
    color: BLACK,
  });
  y -= 25;

  // Checkboxes
  page.drawRectangle({ x: 60, y: y - 2, width: 12, height: 12, borderColor: BLACK, borderWidth: 1 });
  page.drawText('X', { x: 63, y, size: 10, font: boldFont, color: BLACK }); // Checked
  page.drawText('Reflects the actual mileage of the vehicle.', { x: 80, y, size: 10, font, color: BLACK });
  y -= 20;

  page.drawRectangle({ x: 60, y: y - 2, width: 12, height: 12, borderColor: BLACK, borderWidth: 1 });
  page.drawText('Reflects the amount of mileage in excess of its mechanical limits.', { x: 80, y, size: 10, font, color: BLACK });
  y -= 20;

  page.drawRectangle({ x: 60, y: y - 2, width: 12, height: 12, borderColor: BLACK, borderWidth: 1 });
  page.drawText('Is NOT the actual mileage. WARNING - ODOMETER DISCREPANCY', { x: 80, y, size: 10, font, color: BLACK });
  y -= 40;

  // Transferor (Seller)
  drawSectionHeader(page, boldFont, 'TRANSFEROR (SELLER)', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Name', dealer?.dealer_name || dealer?.name || '', 40, y, 250);
  drawField(page, font, boldFont, 'Date', formatDate(deal?.date_of_sale), 310, y, 120);
  y -= 35;

  drawField(page, font, boldFont, 'Address', dealer?.address || '', 40, y, 200);
  drawField(page, font, boldFont, 'City/State/ZIP', `${dealer?.city || ''}, ${dealer?.state || ''} ${dealer?.zip || ''}`, 260, y, 300);
  y -= 50;

  // Transferee (Buyer)
  drawSectionHeader(page, boldFont, 'TRANSFEREE (BUYER)', 40, y, width - 80);
  y -= 35;

  drawField(page, font, boldFont, 'Name', deal?.purchaser_name || customer?.name || '', 40, y, 250);
  drawField(page, font, boldFont, 'Date', formatDate(deal?.date_of_sale), 310, y, 120);
  y -= 35;

  drawField(page, font, boldFont, 'Address', customer?.address || '', 40, y, 200);
  drawField(page, font, boldFont, 'City/State/ZIP', `${customer?.city || ''}, ${customer?.state || ''} ${customer?.zip || ''}`, 260, y, 300);
  y -= 50;

  // Signatures
  page.drawLine({ start: { x: 40, y }, end: { x: 250, y }, thickness: 0.5, color: BLACK });
  page.drawText('Transferor (Seller) Signature', { x: 40, y: y - 12, size: 8, font, color: GRAY });

  page.drawLine({ start: { x: 320, y }, end: { x: 530, y }, thickness: 0.5, color: BLACK });
  page.drawText('Transferee (Buyer) Signature', { x: 320, y: y - 12, size: 8, font, color: GRAY });

  // Warning
  y -= 50;
  page.drawRectangle({ x: 40, y: y - 30, width: width - 80, height: 40, color: rgb(1, 0.95, 0.95), borderColor: rgb(0.8, 0, 0), borderWidth: 1 });
  page.drawText('WARNING: ODOMETER FRAUD IS A FEDERAL CRIME', { x: 50, y: y - 5, size: 10, font: boldFont, color: rgb(0.8, 0, 0) });
  page.drawText('Punishable by fines and/or imprisonment. 49 U.S.C. 32703.', { x: 50, y: y - 20, size: 9, font, color: BLACK });

  // Footer
  page.drawText('Generated by OG Dealer Management System', { x: width / 2 - 100, y: 30, size: 8, font, color: GRAY });

  return await pdfDoc.save();
}

// ============================================
// BILL OF SALE (Simple version)
// ============================================
export async function generateBillOfSale(data: {
  deal: any;
  vehicle: any;
  dealer: any;
  customer: any;
}): Promise<Uint8Array> {
  const { deal, vehicle, dealer, customer } = data;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 50;

  // Title
  page.drawText('BILL OF SALE', { x: width / 2 - 50, y, size: 20, font: boldFont, color: BLACK });
  y -= 40;

  // Date
  page.drawText(`Date: ${formatDate(deal?.date_of_sale)}`, { x: 40, y, size: 11, font, color: BLACK });
  y -= 30;

  // Body text
  const salePrice = parseFloat(deal?.price) || 0;
  const sellerName = dealer?.dealer_name || dealer?.name || 'Seller';
  const buyerName = deal?.purchaser_name || customer?.name || 'Buyer';

  const bodyText = `I, ${sellerName}, hereby sell and transfer to ${buyerName} the following described motor vehicle:`;
  page.drawText(bodyText, { x: 40, y, size: 11, font, color: BLACK, maxWidth: width - 80 });
  y -= 40;

  // Vehicle details box
  page.drawRectangle({ x: 40, y: y - 80, width: width - 80, height: 90, borderColor: BLACK, borderWidth: 1 });

  y -= 15;
  page.drawText(`Year: ${vehicle?.year || ''}`, { x: 50, y, size: 11, font: boldFont, color: BLACK });
  page.drawText(`Make: ${vehicle?.make || ''}`, { x: 150, y, size: 11, font: boldFont, color: BLACK });
  page.drawText(`Model: ${vehicle?.model || ''}`, { x: 300, y, size: 11, font: boldFont, color: BLACK });
  y -= 20;
  page.drawText(`VIN: ${vehicle?.vin || ''}`, { x: 50, y, size: 11, font: boldFont, color: BLACK });
  y -= 20;
  page.drawText(`Color: ${vehicle?.color || ''}`, { x: 50, y, size: 11, font: boldFont, color: BLACK });
  page.drawText(`Odometer: ${(vehicle?.miles || vehicle?.mileage || 0).toLocaleString()} miles`, { x: 200, y, size: 11, font: boldFont, color: BLACK });
  y -= 20;
  page.drawText(`Stock #: ${vehicle?.stock_number || ''}`, { x: 50, y, size: 11, font: boldFont, color: BLACK });
  y -= 40;

  // Sale amount
  page.drawText(`For the sum of: ${formatCurrency(salePrice)}`, { x: 40, y, size: 14, font: boldFont, color: BLACK });
  y -= 25;
  page.drawText(`(${numberToWords(salePrice)} dollars)`, { x: 40, y, size: 10, font, color: GRAY });
  y -= 30;

  // Warranty disclaimer
  page.drawText('The Seller hereby warrants that they are the lawful owner of the above-described vehicle,', { x: 40, y, size: 10, font, color: BLACK });
  y -= 15;
  page.drawText('and that it is free and clear of all liens and encumbrances.', { x: 40, y, size: 10, font, color: BLACK });
  y -= 40;

  // Seller info
  drawSectionHeader(page, boldFont, 'SELLER', 40, y, 250);
  y -= 35;
  drawField(page, font, boldFont, 'Name', sellerName, 40, y, 230);
  y -= 30;
  drawField(page, font, boldFont, 'Address', `${dealer?.address || ''}, ${dealer?.city || ''}, ${dealer?.state || ''} ${dealer?.zip || ''}`, 40, y, 230);
  y -= 40;
  page.drawLine({ start: { x: 40, y }, end: { x: 250, y }, thickness: 0.5, color: BLACK });
  page.drawText('Seller Signature', { x: 40, y: y - 12, size: 8, font, color: GRAY });

  // Buyer info (right side)
  y += 105;
  drawSectionHeader(page, boldFont, 'BUYER', 320, y, 250);
  y -= 35;
  drawField(page, font, boldFont, 'Name', buyerName, 320, y, 230);
  y -= 30;
  drawField(page, font, boldFont, 'Address', `${customer?.address || ''}, ${customer?.city || ''}, ${customer?.state || ''} ${customer?.zip || ''}`, 320, y, 230);
  y -= 40;
  page.drawLine({ start: { x: 320, y }, end: { x: 530, y }, thickness: 0.5, color: BLACK });
  page.drawText('Buyer Signature', { x: 320, y: y - 12, size: 8, font, color: GRAY });

  // Footer
  page.drawText('Generated by OG Dealer Management System', { x: width / 2 - 100, y: 30, size: 8, font, color: GRAY });

  return await pdfDoc.save();
}

// ============================================
// BUYERS GUIDE (AS-IS / WARRANTY)
// ============================================
export async function generateBuyersGuide(data: {
  deal: any;
  vehicle: any;
  dealer: any;
  customer: any;
}): Promise<Uint8Array> {
  const { deal, vehicle, dealer } = data;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 40;

  // Title
  page.drawText('BUYERS GUIDE', { x: width / 2 - 60, y, size: 20, font: boldFont, color: BLACK });
  y -= 15;
  page.drawText('IMPORTANT: Spoken promises are difficult to enforce. Ask the dealer to put all promises in writing.', {
    x: 40, y, size: 8, font, color: GRAY
  });
  y -= 30;

  // Vehicle Info
  page.drawRectangle({ x: 40, y: y - 50, width: width - 80, height: 60, borderColor: BLACK, borderWidth: 1 });
  y -= 15;
  page.drawText(`${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`, { x: 50, y, size: 14, font: boldFont, color: BLACK });
  y -= 18;
  page.drawText(`VIN: ${vehicle?.vin || ''}`, { x: 50, y, size: 10, font, color: BLACK });
  page.drawText(`Stock #: ${vehicle?.stock_number || ''}`, { x: 300, y, size: 10, font, color: BLACK });
  y -= 15;
  page.drawText(`Mileage: ${(vehicle?.miles || vehicle?.mileage || 0).toLocaleString()}`, { x: 50, y, size: 10, font, color: BLACK });
  y -= 35;

  // Warranty Section
  page.drawRectangle({ x: 40, y: y - 150, width: width - 80, height: 160, borderColor: BLACK, borderWidth: 2 });

  y -= 20;
  page.drawText('WARRANTIES FOR THIS VEHICLE:', { x: 50, y, size: 12, font: boldFont, color: BLACK });
  y -= 25;

  // AS IS checkbox (usually checked for used cars)
  page.drawRectangle({ x: 60, y: y - 2, width: 14, height: 14, borderColor: BLACK, borderWidth: 1 });
  page.drawText('X', { x: 63, y, size: 12, font: boldFont, color: BLACK }); // Checked
  page.drawText('AS IS - NO DEALER WARRANTY', { x: 85, y, size: 11, font: boldFont, color: BLACK });
  y -= 18;
  page.drawText('YOU WILL PAY ALL COSTS FOR ANY REPAIRS. The dealer assumes no responsibility for any', { x: 85, y, size: 9, font, color: BLACK });
  y -= 12;
  page.drawText('repairs regardless of any oral statements about the vehicle.', { x: 85, y, size: 9, font, color: BLACK });
  y -= 25;

  // Warranty checkbox
  page.drawRectangle({ x: 60, y: y - 2, width: 14, height: 14, borderColor: BLACK, borderWidth: 1 });
  page.drawText('WARRANTY', { x: 85, y, size: 11, font: boldFont, color: BLACK });
  y -= 18;
  page.drawText('The dealer will pay ____% of the labor and ____% of the parts for the covered systems that fail', { x: 85, y, size: 9, font, color: BLACK });
  y -= 12;
  page.drawText('during the warranty period. Ask the dealer for a copy of the warranty document for a full', { x: 85, y, size: 9, font, color: BLACK });
  y -= 12;
  page.drawText('explanation of warranty coverage, exclusions, and the dealers repair obligations.', { x: 85, y, size: 9, font, color: BLACK });
  y -= 40;

  // Systems covered section
  drawSectionHeader(page, boldFont, 'SYSTEMS COVERED / DURATION', 40, y, width - 80);
  y -= 25;
  page.drawText('[ ] Frame & Body  [ ] Engine  [ ] Transmission  [ ] Drive Axle  [ ] Brakes  [ ] Steering', { x: 50, y, size: 9, font, color: BLACK });
  y -= 15;
  page.drawText('[ ] Electrical  [ ] Cooling  [ ] Air Conditioning  [ ] Fuel System', { x: 50, y, size: 9, font, color: BLACK });
  y -= 30;

  // Service contract section
  page.drawText('SERVICE CONTRACT:', { x: 40, y, size: 11, font: boldFont, color: BLACK });
  y -= 15;
  page.drawText('A service contract is available at an extra charge on this vehicle. Ask for details.', { x: 40, y, size: 9, font, color: BLACK });
  y -= 30;

  // Pre-purchase inspection
  page.drawText('PRE-PURCHASE INSPECTION:', { x: 40, y, size: 11, font: boldFont, color: BLACK });
  y -= 15;
  page.drawText('Ask the dealer if you may have this vehicle inspected by your mechanic either on or off the lot.', { x: 40, y, size: 9, font, color: BLACK });
  y -= 40;

  // Dealer info
  page.drawText(`Dealer: ${dealer?.dealer_name || dealer?.name || ''}`, { x: 40, y, size: 10, font, color: BLACK });
  y -= 15;
  page.drawText(`Address: ${dealer?.address || ''}, ${dealer?.city || ''}, ${dealer?.state || ''} ${dealer?.zip || ''}`, { x: 40, y, size: 10, font, color: BLACK });
  y -= 15;
  page.drawText(`Phone: ${dealer?.phone || ''}`, { x: 40, y, size: 10, font, color: BLACK });

  // Footer
  page.drawText('Generated by OG Dealer Management System', { x: width / 2 - 100, y: 30, size: 8, font, color: GRAY });

  return await pdfDoc.save();
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatCurrency(value: number | string | null): string {
  const num = parseFloat(String(value)) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

  if (num === 0) return 'zero';
  if (num < 0) return 'negative ' + numberToWords(-num);

  const n = Math.floor(num);
  let words = '';

  if (n >= 1000000) {
    words += numberToWords(Math.floor(n / 1000000)) + ' million ';
    num = n % 1000000;
  }
  if (n >= 1000) {
    words += numberToWords(Math.floor(n / 1000)) + ' thousand ';
    num = n % 1000;
  }
  if (n >= 100) {
    words += ones[Math.floor(n / 100)] + ' hundred ';
    num = n % 100;
  }
  if (n >= 20) {
    words += tens[Math.floor(n / 10)] + ' ';
    num = n % 10;
  }
  if (n >= 10 && n < 20) {
    words += teens[n - 10] + ' ';
    num = 0;
  }
  if (n > 0 && n < 10) {
    words += ones[n] + ' ';
  }

  return words.trim();
}

// Export template map
export const TEMPLATES: Record<string, (data: any) => Promise<Uint8Array>> = {
  'MVCS': generateMVCS,
  'Motor Vehicle Contract of Sale': generateMVCS,
  'Bill of Sale': generateBillOfSale,
  'TC-861': generateBillOfSale,
  'Odometer Disclosure': generateOdometerDisclosure,
  'TC-814': generateOdometerDisclosure,
  'Odometer Disclosure Statement': generateOdometerDisclosure,
  'Buyers Guide': generateBuyersGuide,
};
