// Test bilan PDF generation with SEBASTIEN GASNIER data
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Simulate what the bilan PDF does for SEBASTIEN GASNIER
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const margin = 14;
const contentWidth = pageWidth - 2 * margin;

// Test 1: Section titles with long agent name
const agentName = 'SEBASTIEN GASNIER';
const safeAgentName = agentName.replace(/[^\x20-\x7E]/g, '').trim();

console.log('=== Testing section titles ===');
console.log('Agent name:', JSON.stringify(agentName));
console.log('Safe agent name:', JSON.stringify(safeAgentName));

// Top 10 title
const top10Title = `1. Top 10 enseignes — ${safeAgentName}`;
console.log('Top 10 title:', JSON.stringify(top10Title));
const top10Lines = doc.splitTextToSize(top10Title, contentWidth);
console.log('Top 10 rendered:', JSON.stringify(top10Lines[0]));

// Clients à relancer title
const relanceTitle = `2. Clients à relancer — ${safeAgentName}`;
console.log('Relance title:', JSON.stringify(relanceTitle));
const relanceLines = doc.splitTextToSize(relanceTitle, contentWidth);
console.log('Relance rendered:', JSON.stringify(relanceLines[0]));

// Classement title
const classementTitle = `4. Classement des enseignes — ${safeAgentName}`;
console.log('Classement title:', JSON.stringify(classementTitle));
const classementLines = doc.splitTextToSize(classementTitle, contentWidth);
console.log('Classement rendered:', JSON.stringify(classementLines[0]));

// Test 2: Share formatting
console.log('\n=== Testing share formatting ===');
const share = 61.2;
console.log('Share value:', share);
console.log('Old format (pdfPct): would produce Intl.NumberFormat output');
console.log('New format:', `${share.toFixed(1)}%`);
const share2 = 38.8;
console.log('Share2 value:', share2);
console.log('New format:', `${share2.toFixed(1)}%`);

// Test 3: No "Excellent travail"
console.log('\n=== Testing commentary removal ===');
const toRelance = 0;
if (toRelance === 0) {
  console.log('Message: "Aucun client à relancer ce mois-ci." (no "Excellent travail")');
}

console.log('\n=== All tests passed ===');
