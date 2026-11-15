import mongoose, { Schema, Document } from 'mongoose';

export interface IDesign extends Document {
  name: string;
  imageUrl: string;
  qrPosition?: any;
  qrPadding?: number;
  qrConfig?: any;
  textOverlays?: any[];
  qrDataFields?: string[];
}

const designSchema: Schema = new Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  qrPosition: { type: Schema.Types.Mixed },
  qrPadding: { type: Number },
  qrConfig: { type: Schema.Types.Mixed },
  textOverlays: { type: [Schema.Types.Mixed] },
  qrDataFields: { type: [String] },
}, { timestamps: true });

export default mongoose.model<IDesign>('Design', designSchema);