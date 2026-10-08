const bcrypt = require('bcrypt');
const hash = '$2b$10$PDnrRqKTqqCAsknbLlqiOux184d2FEWyMd21FlmpZv9XA4x29KrOu';
console.log('Test Admin@123:', bcrypt.compareSync('Admin@123', hash));
console.log('Test admin@123:', bcrypt.compareSync('admin@123', hash));
console.log('Test Admin@1234:', bcrypt.compareSync('Admin@1234', hash));