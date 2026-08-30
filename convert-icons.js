const fs=require('fs');
const mapping = {
  'view-dashboard':'LayoutDashboard',
  'wallet':'Wallet',
  'piggy-bank':'PiggyBank',
  'calculator':'Calculator',
  'cog':'Settings',
  'apps':'LayoutGrid',
  'chevron-left':'ChevronLeft',
  'chevron-right':'ChevronRight',
  'chevron-down':'ChevronDown',
  'bank':'Landmark',
  'credit-card':'CreditCard',
  'star-four-points':'Sparkles',
  'format-list-numbered':'ListOrdered',
  'note-text':'FileText',
  'plus':'Plus',
  'pencil':'Pencil',
  'trash-can-outline':'Trash2',
  'magnify':'Search',
  'close-circle':'XCircle',
  'pin':'Pin',
  'pin-outline':'PinOff',
  'refresh':'RotateCcw',
  'format-list-checks':'ListChecks',
  'content-copy':'Copy',
  'check':'Check',
  'theme-light-dark':'Palette',
  'information':'Info',
  'vibrate':'Vibrate',
  'arrow-left':'ArrowLeft',
  'chart-bar':'BarChart3',
  'check-circle':'CircleCheck',
  'content-save':'Save',
};
const files = [
  'src/components/PillNav.tsx',
  'src/components/HubHeader.tsx',
  'src/components/AppSwitcher.tsx',
  'src/components/LoanPaymentSection.tsx',
  'src/components/CreditCardSection.tsx',
  'src/components/CustomExpensesSection.tsx',
  'src/components/MonthlySummarySection.tsx',
  'src/components/SettingsScreen.tsx',
  'app/(budget)/index.tsx',
  'app/(budget)/budget.tsx',
  'app/(budget)/loans.tsx',
  'app/(budget)/savings.tsx',
  'app/(dhikr)/index.tsx',
  'app/(dhikr)/list.tsx',
  'app/(notes)/index.tsx',
  'app/(notes)/editor.tsx',
];
files.forEach(f=>{
  if(!fs.existsSync(f)) { console.log('skip missing',f); return; }
  let t=fs.readFileSync(f,'utf8');
  if(!t.includes('MaterialCommunityIcons')) return;
  console.log('processing',f);
  let newContent = t;
  // collect which lucide icons are needed
  let needed = new Set();
  for(const [orig,lucide] of Object.entries(mapping)){
    if(newContent.includes(`name="${orig}"`)) needed.add(lucide);
  }
  // If any unknown name remains, log
  const nameRe = /name="([^"]+)"/g;
  let m;
  while((m=nameRe.exec(newContent))!==null){
    if(!mapping[m[1]]){
      console.log('  UNKNOWN icon',m[1],'in',f);
      needed.add('CircleHelp');
    }
  }
  if(needed.size===0) return;
  const newImport = `import { ${[...needed].join(', ')} } from "lucide-react-native";`;
  newContent = newContent.replace(/import \{ MaterialCommunityIcons \} from "@expo\/vector-icons";/, newImport);
  // Replace each usage
  for(const [orig,lucide] of Object.entries(mapping)){
    // pattern: <MaterialCommunityIcons name="orig" size={...} color={...} /> and with className
    const re = new RegExp('<MaterialCommunityIcons\\s+name="'+orig.replace(/-/g,'\\-')+'"','g');
    newContent = newContent.replace(re, '<'+lucide);
  }
  // Handle any remaining MaterialCommunityIcons (unknown)
  newContent = newContent.replace(/<MaterialCommunityIcons/g, '<CircleHelp');
  // Remove className from Lucide icons (they don't use NativeWind className for color, but keep other className? Lucide ignores className, but we can keep - it will be ignored via css interop? Better remove className that was text color)
  // Actually Lucide React Native does not support className, so remove className="text-..." from icons
  newContent = newContent.replace(/(<[A-Z][a-zA-Z0-9]+\s[^>]*?)className="[^"]*"\s*/g, '$1');
  fs.writeFileSync(f, newContent, 'utf8');
  console.log(' -> wrote',f, [...needed]);
});
