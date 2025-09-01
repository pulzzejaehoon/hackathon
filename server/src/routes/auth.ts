import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[Auth Routes] CRITICAL: Missing JWT_SECRET environment variable');
  process.exit(1);
}

// Simple file-based storage
const USERS_FILE = path.join(__dirname, '../../data/users.json');
const DATA_DIR = path.dirname(USERS_FILE);

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Enhanced user interface
interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at?: string;
  last_login?: string | null;
  email_verified?: boolean;
  verification_token?: string;
  verification_expires?: string;
}

// Load users from file
async function loadUsers(): Promise<Array<User>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch {
    return [];
  }
}

// Save users to file
async function saveUsers(users: Array<User>) {
  try {
    await ensureDataDir();
    const data = JSON.stringify({ users, lastId: Math.max(0, ...users.map(u => u.id)) }, null, 2);
    await fs.writeFile(USERS_FILE, data, 'utf-8');
  } catch (err) {
    console.error('[saveUsers] error', err);
  }
}

// Helpers
async function findUserByEmail(email: string) {
  const users = await loadUsers();
  return users.find(user => user.email === email);
}

async function getNextUserId(): Promise<number> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return (parsed.lastId || 0) + 1;
  } catch {
    return 1;
  }
}

// Input validation helper
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return 'Password must contain at least one lowercase, one uppercase, and one number';
  }
  return null;
};

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    
    // Enhanced input validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const exists = await findUserByEmail(email.toLowerCase().trim());
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 12); // Increased salt rounds for better security
    const userId = await getNextUserId();
    const normalizedEmail = email.toLowerCase().trim();
    const user = {
      id: userId,
      email: normalizedEmail,
      password_hash,
      created_at: new Date().toISOString(),
      last_login: null
    };
    
    // Load current users and add new one
    const users = await loadUsers();
    users.push(user);
    await saveUsers(users);
    
    console.log(`[register] User registered: ${normalizedEmail} with ID: ${userId}`);
    const token = jwt.sign(
      { userId: user.id, email: user.email, iat: Math.floor(Date.now() / 1000) }, 
      JWT_SECRET, 
      { expiresIn: '24h', algorithm: 'HS256' }
    );
    return res.status(201).json({ 
      message: 'Registration successful', 
      token,
      user: { id: user.id, email: user.email } // Don't return sensitive data
    });
  } catch (err: any) {
    console.error('[register] error', err);
    return res.status(500).json({ message: 'Server error during register' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    
    // Enhanced input validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(normalizedEmail);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' }); // Use 401 for auth failures

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    // Update last login time
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex].last_login = new Date().toISOString();
      await saveUsers(users);
    }

    console.log(`[login] User logged in: ${normalizedEmail} with ID: ${user.id}`);
    const token = jwt.sign(
      { userId: user.id, email: user.email, iat: Math.floor(Date.now() / 1000) }, 
      JWT_SECRET, 
      { expiresIn: '24h', algorithm: 'HS256' }
    );
    return res.json({ 
      message: 'Login successful', 
      token,
      user: { id: user.id, email: user.email } // Don't return sensitive data
    });
  } catch (err: any) {
    console.error('[login] error', err);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

export default router;
