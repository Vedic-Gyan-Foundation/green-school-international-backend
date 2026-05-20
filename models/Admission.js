const { promisePool } = require('../config/database');

class Admission {
  // Create a new admission query
  static async create(admissionData) {
    const { 
      childname, 
      fathername, 
      whatsappnumber, 
      class: studentClass, 
      email, 
      address, 
      query: studentQuery 
    } = admissionData;
    
    const sql = `
      INSERT INTO admissions (child_name, father_name, whatsapp_number, class, email, address, query)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await promisePool.query(sql, [
      childname,
      fathername,
      whatsappnumber,
      studentClass,
      email,
      address,
      studentQuery
    ]);
    
    return result.insertId;
  }

  // Get all admissions
  static async getAll() {
    const query = 'SELECT * FROM admissions ORDER BY created_at DESC';
    const [rows] = await promisePool.query(query);
    return rows;
  }
}

module.exports = Admission;
