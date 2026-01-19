

// Then use theme.bg, theme.bgCard, theme.text, etc instead of hardcoded colors
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  subheader: { fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', marginBottom: 8 },
  label: { width: 140, fontWeight: 'bold' },
  value: { flex: 1 },
  section: { marginBottom: 20 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#000', marginVertical: 15 },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  signatureBlock: { width: '45%' },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#000', marginBottom: 5, height: 30 },
  signatureLabel: { fontSize: 9, color: '#666' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  dealerInfo: { textAlign: 'center', marginBottom: 20, fontSize: 10, color: '#444' },
  table: { marginTop: 10 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 6 },
  tableHeader: { backgroundColor: '#f0f0f0', fontWeight: 'bold' },
  tableCell: { flex: 1, paddingHorizontal: 4 },
  tableCellRight: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 8, marginTop: 10 },
  totalLabel: { flex: 1, fontWeight: 'bold', fontSize: 13 },
  totalValue: { fontWeight: 'bold', fontSize: 13 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#666', textAlign: 'center' }
});

// BILL OF SALE
export const BillOfSale = ({ dealer, vehicle, customer, deal }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.title}>BILL OF SALE</Text>
      <Text style={styles.dealerInfo}>
        {dealer.dealer_name}{'\n'}
        {dealer.address}, {dealer.city}, {dealer.state} {dealer.zip}{'\n'}
        {dealer.phone} • License #{dealer.dealer_license}
      </Text>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.subheader}>Vehicle Information</Text>
        <View style={styles.row}><Text style={styles.label}>Year/Make/Model:</Text><Text style={styles.value}>{vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim || ''}</Text></View>
        <View style={styles.row}><Text style={styles.label}>VIN:</Text><Text style={styles.value}>{vehicle.vin || 'N/A'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Odometer:</Text><Text style={styles.value}>{(vehicle.miles || vehicle.mileage || 0).toLocaleString()} miles</Text></View>
        <View style={styles.row}><Text style={styles.label}>Color:</Text><Text style={styles.value}>{vehicle.color || 'N/A'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Stock #:</Text><Text style={styles.value}>{vehicle.stock_number || vehicle.id}</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Buyer Information</Text>
        <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{customer.name || deal.purchaser_name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Address:</Text><Text style={styles.value}>{customer.address || 'On file'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{customer.phone || 'On file'}</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Sale Details</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.tableCell}>Description</Text>
            <Text style={styles.tableCellRight}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Vehicle Sale Price</Text>
            <Text style={styles.tableCellRight}>${(deal.price || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Documentation Fee</Text>
            <Text style={styles.tableCellRight}>$299</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Sales Tax ({dealer.state === 'UT' ? '7.25%' : '6%'})</Text>
            <Text style={styles.tableCellRight}>${Math.round((deal.price || 0) * 0.0725).toLocaleString()}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Title & Registration</Text>
            <Text style={styles.tableCellRight}>$150</Text>
          </View>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL DUE</Text>
          <Text style={styles.totalValue}>${((deal.price || 0) + 299 + Math.round((deal.price || 0) * 0.0725) + 150).toLocaleString()}</Text>
        </View>
        {deal.down_payment > 0 && (
          <View style={styles.row}><Text style={styles.label}>Down Payment:</Text><Text style={styles.value}>-${(deal.down_payment || 0).toLocaleString()}</Text></View>
        )}
      </View>

      <View style={styles.divider} />

      <Text style={{ fontSize: 9, marginBottom: 20 }}>
        The undersigned Buyer hereby purchases the above described vehicle from the Seller AS-IS, WHERE-IS, 
        with all faults and without any warranty, express or implied, unless otherwise noted. Buyer acknowledges 
        receipt of all documents required by law.
      </Text>

      <View style={styles.signatureRow}>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Buyer Signature / Date</Text>
        </View>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Dealer Representative / Date</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        Date of Sale: {deal.date_of_sale || new Date().toLocaleDateString()} • 
        This document is a legal bill of sale for the State of {dealer.state || 'UT'}
      </Text>
    </Page>
  </Document>
);

// BUYER'S GUIDE (AS-IS)
export const BuyersGuide = ({ dealer, vehicle }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.title}>BUYER'S GUIDE</Text>
      <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 12 }}>IMPORTANT: Spoken promises are difficult to enforce. Ask the dealer to put all promises in writing.</Text>

      <View style={{ borderWidth: 2, borderColor: '#000', padding: 15, marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>AS IS - NO WARRANTY</Text>
        <Text style={{ fontSize: 10, textAlign: 'center' }}>
          YOU WILL PAY ALL COSTS FOR ANY REPAIRS. The dealer assumes no responsibility for any repairs regardless of any oral statements about the vehicle.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Vehicle Information</Text>
        <View style={styles.row}><Text style={styles.label}>Year/Make/Model:</Text><Text style={styles.value}>{vehicle.year} {vehicle.make} {vehicle.model}</Text></View>
        <View style={styles.row}><Text style={styles.label}>VIN:</Text><Text style={styles.value}>{vehicle.vin || 'N/A'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Odometer:</Text><Text style={styles.value}>{(vehicle.miles || vehicle.mileage || 0).toLocaleString()} miles</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Systems Covered / Major Defects</Text>
        <Text style={{ fontSize: 9, marginBottom: 10 }}>
          Ask the dealer for a list of the major systems on this vehicle. The following systems may have defects:
        </Text>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ Frame & Body    ☐ Engine    ☐ Transmission    ☐ Differential    ☐ Cooling System</Text></View>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ Electrical    ☐ Fuel System    ☐ Brakes    ☐ Steering    ☐ Suspension</Text></View>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ Air Conditioning    ☐ Exhaust    ☐ Other: _______________________</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Pre-Purchase Inspection</Text>
        <Text style={{ fontSize: 10 }}>
          YOU SHOULD ASK THE DEALER IF YOU MAY HAVE THIS VEHICLE INSPECTED BY YOUR MECHANIC EITHER ON OR OFF THE LOT.
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.signatureRow}>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Buyer Signature / Date</Text>
        </View>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Dealer Representative / Date</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        {dealer.dealer_name} • {dealer.address}, {dealer.city}, {dealer.state} {dealer.zip} • {dealer.phone}
      </Text>
    </Page>
  </Document>
);

// ODOMETER DISCLOSURE
export const OdometerDisclosure = ({ dealer, vehicle, customer, deal }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.title}>ODOMETER DISCLOSURE STATEMENT</Text>
      <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 10 }}>Federal law (and State law) requires that you state the mileage upon transfer of ownership.</Text>

      <View style={styles.section}>
        <Text style={styles.subheader}>Vehicle Information</Text>
        <View style={styles.row}><Text style={styles.label}>Year:</Text><Text style={styles.value}>{vehicle.year}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Make:</Text><Text style={styles.value}>{vehicle.make}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Model:</Text><Text style={styles.value}>{vehicle.model}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Body Type:</Text><Text style={styles.value}>{vehicle.body_class || 'N/A'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>VIN:</Text><Text style={styles.value}>{vehicle.vin || 'N/A'}</Text></View>
      </View>

      <View style={{ borderWidth: 2, borderColor: '#000', padding: 15, marginBottom: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>ODOMETER READING: {(vehicle.miles || vehicle.mileage || 0).toLocaleString()} miles</Text>
        <Text style={{ fontSize: 10, marginBottom: 10 }}>(No tenths)</Text>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ I hereby certify that to the best of my knowledge the odometer reading reflects the actual mileage.</Text></View>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ I hereby certify that the odometer reading reflects mileage in EXCESS of the odometer's mechanical limits.</Text></View>
        <View style={styles.row}><Text style={{ fontSize: 10 }}>☐ I hereby certify that the odometer reading is NOT the actual mileage - WARNING - ODOMETER DISCREPANCY.</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Transferor (Seller)</Text>
        <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{dealer.dealer_name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Address:</Text><Text style={styles.value}>{dealer.address}, {dealer.city}, {dealer.state} {dealer.zip}</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.subheader}>Transferee (Buyer)</Text>
        <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{customer.name || deal.purchaser_name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Address:</Text><Text style={styles.value}>{customer.address || '________________________________'}</Text></View>
      </View>

      <View style={styles.signatureRow}>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Transferor Signature / Date</Text>
        </View>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Transferee Signature / Date</Text>
        </View>
      </View>

      <Text style={{ marginTop: 20, fontSize: 8, color: '#666' }}>
        WARNING: FEDERAL AND STATE LAW REQUIRES THAT YOU STATE THE MILEAGE IN CONNECTION WITH THE TRANSFER OF OWNERSHIP. 
        FAILURE TO COMPLETE OR PROVIDING A FALSE STATEMENT MAY RESULT IN FINES AND/OR IMPRISONMENT.
      </Text>
    </Page>
  </Document>
);

// Generate PDF blob
export const generatePDF = async (DocumentComponent, props) => {
  const blob = await pdf(<DocumentComponent {...props} />).toBlob();
  return blob;
};

// Download PDF
export const downloadPDF = async (DocumentComponent, props, filename) => {
  const blob = await generatePDF(DocumentComponent, props);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};