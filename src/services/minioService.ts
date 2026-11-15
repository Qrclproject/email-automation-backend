import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT as string,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY as string,
  secretKey: process.env.MINIO_SECRET_KEY as string,
});

const bucketName = process.env.MINIO_BUCKET as string;

export const uploadFileToMinio = async (fileBuffer: Buffer, fileName: string, mimetype: string): Promise<string> => {
  try {
    // Ensure bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      // Note: You might need to set a public policy on the bucket in MinIO UI
    }

    // Upload the file
    await minioClient.putObject(bucketName, fileName, fileBuffer, fileBuffer.length, {
      'Content-Type': mimetype,
    });

    // Return the public URL
    return `${process.env.MINIO_PUBLIC_BASE_URL}/${fileName}`;
  } catch (error: any) {
    console.error('MinIO Upload Error:', error);
    throw new Error('Failed to upload file to MinIO');
  }
};