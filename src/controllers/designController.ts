import { Request, Response } from 'express';
import Design from '../models/Design';
import { uploadFileToMinio } from '../services/minioService';

// Matches frontend mock: returns { data: { data: ... } }
export const getDesigns = async (req: Request, res: Response) => {
  try {
    const designs = await Design.find().sort({ createdAt: -1 });
    res.json({ data: designs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDesignById = async (req: Request, res: Response) => {
  try {
    const design = await Design.findById(req.params.id);
    res.json({ data: design });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createDesign = async (req: Request, res: Response) => {
  try {
    const { name, data } = req.body;
    const parsedData = JSON.parse(data);
    let imageUrl = '';

    // If a file was uploaded, push it to MinIO and get the URL
    if (req.file) {
      const fileName = `designs/${Date.now()}-${req.file.originalname}`;
      imageUrl = await uploadFileToMinio(req.file.buffer, fileName, req.file.mimetype);
    }

    const newDesign = await Design.create({
      ...parsedData, // Spread parsed data first
      name,
      ...(imageUrl && { imageUrl }), // Overwrite imageUrl with the MinIO URL if a file was uploaded
    });

    res.status(201).json({ data: newDesign });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateDesign = async (req: Request, res: Response) => {
  try {
    const updated = await Design.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ data: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteDesign = async (req: Request, res: Response) => {
  try {
    await Design.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};