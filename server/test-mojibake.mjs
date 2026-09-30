import iconv from 'iconv-lite';
const s = '┘à╪╡┘╪╣ ╪د╪│╪د╪│ ╪د┘╪╡┘╪╣╪ر'; // corrupted "مصنع اساس الصناعة"
const bytes = iconv.encode(s, 'cp437');
const fixed = iconv.decode(bytes, 'utf8');
console.log('corrupt codepoints:', Array.from(s).map(c => c.codePointAt(0).toString(16)).join(' '));
console.log('fixed  :', fixed);
console.log('fixed codepoints:', Array.from(fixed).map(c => c.codePointAt(0).toString(16)).join(' '));
console.log('has replacement char?', fixed.includes('\uFFFD'));