import { Request, Response } from 'express';
import { google } from 'googleapis';
import { createOAuth2Client, SCOPES } from '../services/googleAuthService';
import Account from '../models/Account';
import { AuthRequest } from '../middlewares/authMiddleware';

// GET /api/accounts/auth-url
export const getAuthUrl = (req: AuthRequest, res: Response) => {
  const oauth2Client = createOAuth2Client();
  const state = req.user._id.toString();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    state: state,
    prompt: 'consent',
  });

  res.json({ authUrl });
};

// GET /api/accounts/callback
export const handleCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Authorization code or state missing.');
  }

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      return res.status(400).send('No refresh token received.');
    }

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return res.status(400).send('Could not retrieve email address.');
    }

    await Account.findOneAndUpdate(
      { email: email },
      {
        user: state as string,
        email: email,
        displayName: userInfo.data.name || email.split('@')[0],
        refreshToken: tokens.refresh_token,
        status: 'connected',
        lastTokenRefresh: new Date(),
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true } // <-- Fixed here
    );

    res.redirect(`${process.env.FRONTEND_URL}/accounts?connected=true`);
  } catch (error: any) {
    console.error('OAuth Callback Error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/accounts?error=oauth_failed`);
  }
};

// GET /api/accounts
export const getAccounts = async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await Account.find({ user: req.user._id });
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/accounts/:id
export const updateAccount = async (req: Request, res: Response) => {
  try {
    const updated = await Account.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { returnDocument: 'after' } // <-- Fixed here
    );
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/accounts/:id
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    await Account.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};