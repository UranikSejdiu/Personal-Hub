const fs=require('fs');
const files=['src/components/CustomExpensesSection.tsx','src/components/LoanPaymentSection.tsx','src/components/CreditCardSection.tsx','app/(budget)/savings.tsx','app/(dhikr)/index.tsx'];
files.forEach(f=>{
  let t=fs.readFileSync(f,'utf8');
  console.log('---',f);
  console.log('has flex-1 bg-background', t.includes('flex-1 bg-background'));
  console.log('has className count', (t.match(/className/g)||[]).length);
  console.log(t.slice(0,400).replace(/\n/g,'\\n'));
});
