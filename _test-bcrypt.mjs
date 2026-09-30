import bcrypt from 'bcrypt';
const hash = '$2b$12$BYVi5K3qCmnfwkDY0Rn3TuNlohELRXlpfTB2AEsMQ5WHtMule3BLC';
const ok = await bcrypt.compare('admin123', hash);
console.log('bcrypt.compare admin123:', ok);