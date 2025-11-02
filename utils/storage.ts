import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(process.cwd(), "temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Save a file buffer to local storage and return a URL to access it
 * @param buffer - The file buffer to save
 * @param contentType - The MIME type of the file (e.g., 'image/png')
 * @param filename - Optional filename, otherwise a UUID will be generated
 * @returns The URL to access the file
 */
export async function saveFile(
  buffer: Buffer,
  contentType: string,
  filename?: string
): Promise<string> {
  // Generate filename if not provided
  const fileExtension = getExtensionFromContentType(contentType);
  const finalFilename = filename || `${uuidv4()}${fileExtension}`;
  
  // Ensure filename is safe (remove any path traversal attempts)
  const safeFilename = path.basename(finalFilename);
  
  const filePath = path.join(TEMP_DIR, safeFilename);
  
  // Write file to disk
  await fs.promises.writeFile(filePath, buffer);
  
  // Return URL that can be used to access the file
  // This assumes the API route will be at /api/media/[filename]
  // Use environment variable for base URL if available, otherwise construct from common patterns
  // Priority: NGROK_URL (for local dev with ngrok) > NEXT_PUBLIC_BASE_URL > VERCEL_URL > BASE_URL > localhost
  let baseUrl: string;
  
  if (process.env.NGROK_URL) {
    // NGROK_URL is for local development with ngrok (e.g., "https://abc123.ngrok.io")
    baseUrl = process.env.NGROK_URL;
  } else if (process.env.NEXT_PUBLIC_BASE_URL) {
    baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  } else if (process.env.VERCEL_URL) {
    // VERCEL_URL is set by Vercel (e.g., "your-app.vercel.app" or "your-app-xxx.vercel.app")
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else if (process.env.NODE_ENV === 'production') {
    // In production without explicit URL, try to infer from host
    baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  } else {
    // Development (default to localhost)
    baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  }
  
  // Remove trailing slash if present
  baseUrl = baseUrl.replace(/\/$/, '');
  
  return `${baseUrl}/api/media/${safeFilename}`;
}

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
  const extensions: { [key: string]: string } = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  
  return extensions[contentType] || '.bin';
}

/**
 * Get the file path for a given filename
 */
export function getFilePath(filename: string): string {
  const safeFilename = path.basename(filename);
  return path.join(TEMP_DIR, safeFilename);
}

/**
 * Check if a file exists
 */
export function fileExists(filename: string): boolean {
  const safeFilename = path.basename(filename);
  const filePath = path.join(TEMP_DIR, safeFilename);
  return fs.existsSync(filePath);
}

/**
 * Read a file from storage
 */
export async function readFile(filename: string): Promise<Buffer> {
  const safeFilename = path.basename(filename);
  const filePath = path.join(TEMP_DIR, safeFilename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}`);
  }
  
  return await fs.promises.readFile(filePath);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(filename: string): Promise<void> {
  const safeFilename = path.basename(filename);
  const filePath = path.join(TEMP_DIR, safeFilename);
  
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    console.log(`Deleted file: ${safeFilename}`);
  } else {
    console.log(`File not found, skipping deletion: ${safeFilename}`);
  }
}

/**
 * Extract filename from a media URL
 * Example: "https://example.com/api/media/abc123.png" -> "abc123.png"
 */
export function extractFilenameFromMediaUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // Only return if it looks like a valid filename (has extension)
    if (filename && filename.includes('.')) {
      return path.basename(filename); // Ensure it's safe
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
}

