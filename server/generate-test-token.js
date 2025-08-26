import jwt from 'jsonwebtoken';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET || 'your_strong_jwt_secret_here';
const testUser = {
  userId: 1,
  email: 'jaehoon@interactor.com' // Using the email from your curl example
};

const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '24h' });
console.log('Test Bearer Token:', token);