import mongoose, { Schema, Document } from 'mongoose';

export interface IAccount extends Document {
  user: mongoose.Types.ObjectId;
  email: string;
  displayName?: string;
  refreshToken: string;
  status: 'connected' | 'reconnect-needed';
  permissions: { send: boolean; readInbox: boolean };
  dailyLimit: number;
  sentToday: number;
  lastTokenRefresh?: Date;
}

const accountSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true, unique: true },
  displayName: { type: String },
  refreshToken: { type: String, required: true },
  status: { type: String, enum: ['connected', 'reconnect-needed'], default: 'connected' },
  permissions: {
    send: { type: Boolean, default: true },
    readInbox: { type: Boolean, default: false },
  },
  dailyLimit: { type: Number, default: 500 },
  sentToday: { type: Number, default: 0 },
  lastTokenRefresh: { type: Date },
}, { timestamps: true });

export default mongoose.model<IAccount>('Account', accountSchema);