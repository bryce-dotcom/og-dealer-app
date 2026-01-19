import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1024,
  }
});

function buildContext(storeData) {
  const { inventory, employees, bhphLoans, deals } = storeData;
  
  const inStock = inventory?.filter(v => v.status === 'In Stock') || [];
  const sold = inventory?.filter(v => v.status === 'Sold') || [];
  const activeLoans = bhphLoans?.filter(l => l.status === 'Active') || [];
  
  return `You are the AI assistant for OG DiX Motor Club, a used car dealership in Utah.

TODAY: ${new Date().toLocaleDateString()}

INVENTORY (${inventory?.length || 0} total):
- In Stock: ${inStock.length}
- Sold: ${sold.length}
${inStock.slice(0, 10).map(v => `- ${v.unit_id}: ${v.year} ${v.make} ${v.model}`).join('\n')}

EMPLOYEES (${employees?.length || 0}):
${employees?.map(e => `- ${e.name} - ${e.role}`).join('\n') || 'None'}

BHPH LOANS (${activeLoans.length} active):
${activeLoans.map(l => `- ${l.customerName}: $${l.monthlyPayment}/mo`).join('\n') || 'None'}

DEALS (${deals?.length || 0}):
${deals?.slice(0, 5).map(d => `- ${d.purchaserName}: ${d.year} ${d.make} $${d.cashPrice}`).join('\n') || 'None'}

Be concise. Use the data above.`;
}

export async function askGemini(query, storeData) {
  try {
    const context = buildContext(storeData);
    const prompt = context + '\n\nQUESTION: ' + query;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini error:', error);
    return 'Error: ' + error.message;
  }
}

export function calculatePayment(principal, annualRate, months) {
  const monthlyRate = annualRate / 12;
  const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return {
    payment: payment.toFixed(2),
    totalPayments: (payment * months).toFixed(2),
    financeCharge: ((payment * months) - principal).toFixed(2)
  };
}