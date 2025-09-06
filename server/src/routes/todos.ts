// server/src/routes/todos.ts - Todo order management API
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path for storing todo order data
const TODO_ORDERS_FILE = path.join(__dirname, '../../data/todo-orders.json');

// Ensure data directory exists
const dataDir = path.dirname(TODO_ORDERS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing todo orders or create empty object
const loadTodoOrders = () => {
  try {
    if (fs.existsSync(TODO_ORDERS_FILE)) {
      const data = fs.readFileSync(TODO_ORDERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to load todo orders:', error);
  }
  return {};
};

// Save todo orders to file
const saveTodoOrders = (orders: any) => {
  try {
    fs.writeFileSync(TODO_ORDERS_FILE, JSON.stringify(orders, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save todo orders:', error);
    return false;
  }
};

// GET /api/todos/order/:userId - Get user's todo orders
router.get('/order/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const orders = loadTodoOrders();
    const userOrders = orders[userId] || {};
    
    res.json({
      ok: true,
      orders: userOrders
    });
  } catch (error: any) {
    console.error('Failed to get todo orders:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get todo orders'
    });
  }
});

// POST /api/todos/order/:userId - Save user's todo orders
router.post('/order/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { filterKey, todoIds } = req.body;
    
    if (!filterKey || !Array.isArray(todoIds)) {
      return res.status(400).json({
        ok: false,
        error: 'filterKey and todoIds array are required'
      });
    }
    
    const orders = loadTodoOrders();
    if (!orders[userId]) {
      orders[userId] = {};
    }
    
    orders[userId][filterKey] = todoIds;
    
    if (saveTodoOrders(orders)) {
      res.json({
        ok: true,
        message: 'Todo order saved successfully'
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'Failed to save todo order'
      });
    }
  } catch (error: any) {
    console.error('Failed to save todo orders:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to save todo orders'
    });
  }
});

// DELETE /api/todos/order/:userId/:filterKey - Delete specific filter order
router.delete('/order/:userId/:filterKey', (req, res) => {
  try {
    const { userId, filterKey } = req.params;
    const orders = loadTodoOrders();
    
    if (orders[userId] && orders[userId][filterKey]) {
      delete orders[userId][filterKey];
      
      if (saveTodoOrders(orders)) {
        res.json({
          ok: true,
          message: 'Todo order deleted successfully'
        });
      } else {
        res.status(500).json({
          ok: false,
          error: 'Failed to delete todo order'
        });
      }
    } else {
      res.status(404).json({
        ok: false,
        error: 'Todo order not found'
      });
    }
  } catch (error: any) {
    console.error('Failed to delete todo order:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to delete todo order'
    });
  }
});

export default router;