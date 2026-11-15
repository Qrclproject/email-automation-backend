import * as Minio from 'minio';

export const uploadFileToMinio = async (fileBuffer: Buffer, fileName: string, mimetype: string): Promise<string> => {
  try {
    // Initialize the client INSIDE the function so it reads env vars at runtime
    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT as string,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY as string,
      secretKey: process.env.MINIO_SECRET_KEY as string,
    });

    const bucketName = process.env.MINIO_BUCKET as string;

    // Ensure bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
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