import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middlewares/authMiddleware';

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: '30d' });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.status === 'Inactive') {
        return res.status(403).json({ message: 'Account is inactive. Contact an admin.' });
      }

      user.lastLogin = new Date();
      await user.save();

      res.json({
        user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role }, // Fixed here
        token: generateToken(user._id.toString()), // Fixed here
        refreshToken: 'mock_refresh_token'
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const signup = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const user = await User.create({ name, email, password, role });

    if (user) {
      res.status(201).json({
        user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role }, // Fixed here
        token: generateToken(user._id.toString()), // Fixed here
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  if (req.user) {
    res.json({ id: req.user._id.toString(), name: req.user.name, email: req.user.email, role: req.user.role }); // Fixed here
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};