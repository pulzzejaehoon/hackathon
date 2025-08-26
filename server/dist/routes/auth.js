import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
// Simple file-based storage
const USERS_FILE = path.join(__dirname, '../../data/users.json');
const DATA_DIR = path.dirname(USERS_FILE);
// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    }
    catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}
// Load users from file
async function loadUsers() {
    try {
        await ensureDataDir();
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return parsed.users || [];
    }
    catch {
        return [];
    }
}
// Save users to file
async function saveUsers(users) {
    try {
        await ensureDataDir();
        const data = JSON.stringify({ users, lastId: Math.max(0, ...users.map(u => u.id)) }, null, 2);
        await fs.writeFile(USERS_FILE, data, 'utf-8');
    }
    catch (err) {
        console.error('[saveUsers] error', err);
    }
}
// Helpers
async function findUserByEmail(email) {
    const users = await loadUsers();
    return users.find(user => user.email === email);
}
async function getNextUserId() {
    try {
        await ensureDataDir();
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return (parsed.lastId || 0) + 1;
    }
    catch {
        return 1;
    }
}
// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ message: 'Email and password are required' });
        const exists = await findUserByEmail(email);
        if (exists)
            return res.status(400).json({ message: 'Email already registered' });
        const password_hash = await bcrypt.hash(password, 10);
        const userId = await getNextUserId();
        const user = {
            id: userId,
            email,
            password_hash
        };
        // Load current users and add new one
        const users = await loadUsers();
        users.push(user);
        await saveUsers(users);
        console.log(`[register] User registered: ${email} with ID: ${userId}`);
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        return res.status(201).json({ message: 'Registered', token });
    }
    catch (err) {
        console.error('[register] error', err);
        return res.status(500).json({ message: 'Server error during register' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ message: 'Email and password are required' });
        const user = await findUserByEmail(email);
        if (!user)
            return res.status(400).json({ message: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok)
            return res.status(400).json({ message: 'Invalid credentials' });
        console.log(`[login] User logged in: ${email} with ID: ${user.id}`);
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ message: 'Logged in successfully', token });
    }
    catch (err) {
        console.error('[login] error', err);
        return res.status(500).json({ message: 'Server error during login' });
    }
});
export default router;
